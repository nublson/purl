import "server-only";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { assertCanSaveLink, assertCanStore } from "@/lib/entitlements";
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_PREVIEW_BYTES } from "@/lib/limits";
import { isOwnBlobPathname } from "@/lib/uploads/blob-url";
import { UPLOAD_MIME_TYPES } from "@/lib/uploads/mime";

/** How long a client token may start an upload. */
const TOKEN_VALIDITY_MS = 10 * 60_000;

/** The preview's one allowed type (`makePreview` encodes WebP). */
const PREVIEW_MIME_TYPE = "image/webp";

export type UploadRejectedCode =
  | "INVALID_PAYLOAD"
  | "INVALID_PATH"
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE";

const REJECTION_MESSAGES: Record<UploadRejectedCode, string> = {
  INVALID_PAYLOAD: "Invalid upload details",
  INVALID_PATH: "Invalid upload path",
  UNSUPPORTED_TYPE: "This file type isn't supported",
  FILE_TOO_LARGE: `Files can be up to ${MAX_UPLOAD_FILE_BYTES / (1024 * 1024)} MB`,
};

/** The upload can't get a token; the route answers 400 with `code`. */
export class UploadRejectedError extends Error {
  readonly name = "UploadRejectedError";

  constructor(readonly code: UploadRejectedCode) {
    super(REJECTION_MESSAGES[code]);
  }
}

type UploadClientPayload = {
  kind: "file" | "preview";
  mimeType: string;
  size: number;
};

function parseClientPayload(raw: string | null): UploadClientPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "");
  } catch {
    throw new UploadRejectedError("INVALID_PAYLOAD");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UploadRejectedError("INVALID_PAYLOAD");
  }
  const { kind, mimeType, size } = value as Record<string, unknown>;
  if (
    (kind !== "file" && kind !== "preview") ||
    typeof mimeType !== "string" ||
    typeof size !== "number" ||
    !Number.isInteger(size)
  ) {
    throw new UploadRejectedError("INVALID_PAYLOAD");
  }
  return { kind, mimeType, size };
}

/**
 * The pathname is the user's own (`isOwnBlobPathname`) and exactly
 * `users/<userId>/<upload id>/<name>`; returns `<name>`, else null.
 */
function uploadFileName(pathname: string, userId: string): string | null {
  if (!isOwnBlobPathname(pathname, userId)) return null;
  const rest = pathname.slice(`users/${userId}/`.length).split("/");
  return rest.length === 2 ? rest[1] : null;
}

/**
 * Answers the browser's `upload()` with a client token for exactly this
 * file: its path under the user's folder, its type and its size, for 10
 * minutes. A preview is capped at `MAX_UPLOAD_PREVIEW_BYTES`. A file (not its
 * preview) must also fit the link cap and the account's storage; those
 * `LimitError`s propagate.
 *
 * No `onUploadCompleted`: Purl creates the row itself after the upload
 * (`POST /api/links`), and passing one makes the SDK ask Vercel Blob to call
 * this route back, which it can't do usefully (no session; never localhost).
 */
export async function issueUploadToken(
  userId: string,
  body: HandleUploadBody,
  request: Request,
): Promise<unknown> {
  return handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const { kind, mimeType, size } = parseClientPayload(clientPayload);
      const name = uploadFileName(pathname, userId);
      if (name === null) {
        throw new UploadRejectedError("INVALID_PATH");
      }
      if (kind === "preview") {
        if (!name.startsWith("preview")) {
          throw new UploadRejectedError("INVALID_PATH");
        }
        if (mimeType !== PREVIEW_MIME_TYPE) {
          throw new UploadRejectedError("UNSUPPORTED_TYPE");
        }
      } else if (!UPLOAD_MIME_TYPES.includes(mimeType)) {
        throw new UploadRejectedError("UNSUPPORTED_TYPE");
      }
      const maxBytes =
        kind === "preview" ? MAX_UPLOAD_PREVIEW_BYTES : MAX_UPLOAD_FILE_BYTES;
      if (size <= 0 || size > maxBytes) {
        throw new UploadRejectedError("FILE_TOO_LARGE");
      }
      if (kind === "file") {
        await assertCanSaveLink(userId);
        await assertCanStore(userId, size);
      }
      return {
        allowedContentTypes: [mimeType],
        maximumSizeInBytes: size,
        addRandomSuffix: true,
        validUntil: Date.now() + TOKEN_VALIDITY_MS,
        tokenPayload: JSON.stringify({ userId }),
      };
    },
  });
}
