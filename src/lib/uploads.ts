import "server-only";

import { del, head } from "@vercel/blob";
import { insertWithinSaveLimit } from "@/lib/entitlements";
import { assertFolderOwned, FolderNotFoundError } from "@/lib/folders";
import { mapRowToLink } from "@/lib/links";
import prisma from "@/lib/prisma";
import { blobPathnameOf, isBlobUrl, isOwnBlobPathname } from "@/lib/uploads/blob-url";
import { contentTypeForMime, UPLOAD_MIME_TYPES } from "@/lib/uploads/mime";
import type { Link } from "@/utils/links";
import { titleFromFileName } from "@/utils/media-title";

/** Uploads need a Vercel Blob store; without its token they're hidden. */
export function uploadsEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** What the browser sends once its file (and preview) are in Blob. */
export type UploadInput = {
  url: string;
  previewUrl: string | null;
  /** The file's original name (the row's title), not the sanitized pathname. */
  name: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
};

/** The upload can't become a pearl; the route answers 400 `INVALID_UPLOAD`. */
export class InvalidUploadError extends Error {
  readonly name = "InvalidUploadError";
  readonly code = "INVALID_UPLOAD";
}

/** The preview's one allowed type (`makePreview` encodes WebP). */
const PREVIEW_MIME_TYPE = "image/webp";
const MAX_DIMENSION = 100_000;
/** 100 days, in seconds: keeps nonsense out of the Int column. */
const MAX_DURATION = 86_400 * 100;
/** An upload's favicon: Purl's own icon. */
const UPLOAD_FAVICON = "/icon.png";

/** The body's `upload` with the right field types, or null; values are checked by `createUploadForUser`. */
export function parseUploadInput(value: unknown): UploadInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const { url, name, mimeType } = raw;
  if (
    typeof url !== "string" ||
    typeof name !== "string" ||
    typeof mimeType !== "string"
  ) {
    return null;
  }
  const previewUrl = raw.previewUrl ?? null;
  if (previewUrl !== null && typeof previewUrl !== "string") return null;
  const numbers: (number | null)[] = [];
  for (const key of ["width", "height", "duration"] as const) {
    const n = raw[key] ?? null;
    if (n !== null && typeof n !== "number") return null;
    numbers.push(n);
  }
  const [width, height, duration] = numbers;
  return { url, previewUrl, name, mimeType, width, height, duration };
}

function isSizeOrNull(value: number | null, max: number): boolean {
  return value === null || (Number.isInteger(value) && value > 0 && value <= max);
}

/** Lowercased, without parameters (`audio/mpeg; charset=binary` → `audio/mpeg`). */
function normalizeMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** The host of `BASE_URL` (an upload's domain): `purl.live`. */
function uploadDomain(): string {
  try {
    return new URL(process.env.BASE_URL as string).host;
  } catch {
    return "purl.live";
  }
}

/** The blob URL's pathname when it's in this user's own prefix, else null. */
function ownPathname(url: string, userId: string): string | null {
  if (!isBlobUrl(url)) return null;
  const pathname = blobPathnameOf(url);
  return pathname && isOwnBlobPathname(pathname, userId) ? pathname : null;
}

/** Prisma's foreign-key violation (P2003): the folder went away before the insert. */
function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2003"
  );
}

/**
 * Best effort: deletes the blobs of an upload that won't become a pearl.
 * Skipped when a saved link already uses one of them (a retried save of a
 * file that was saved the first time); the sweep removes anything left.
 */
async function discardBlobs(
  userId: string,
  fileKey: string,
  urls: string[],
): Promise<void> {
  try {
    const inUse = await prisma.link.findFirst({
      where: {
        userId,
        OR: [{ fileKey }, { url: { in: urls } }, { thumbnail: { in: urls } }],
      },
      select: { id: true },
    });
    if (inUse) return;
    await del(urls);
  } catch (error) {
    console.error("[createUploadForUser] couldn't delete the uploaded blobs", error);
  }
}

/**
 * Turns a file the browser put in Blob into a pearl. The client's claims are
 * checked against Blob itself: `head()` runs with Purl's token, so a URL from
 * another store (or a missing blob) fails, and the size counted against the
 * storage cap is Blob's. Once both heads succeed, any failure (wrong type,
 * the save or storage limit, the folder gone, the database) deletes the
 * blobs before rethrowing. Two uploads of one file are two pearls.
 */
export async function createUploadForUser(
  userId: string,
  input: UploadInput,
  opts?: { folderId?: string },
): Promise<Link> {
  if (opts?.folderId !== undefined) {
    await assertFolderOwned(userId, opts.folderId);
  }

  if (
    !isSizeOrNull(input.width, MAX_DIMENSION) ||
    !isSizeOrNull(input.height, MAX_DIMENSION) ||
    !isSizeOrNull(input.duration, MAX_DURATION)
  ) {
    throw new InvalidUploadError("Invalid upload dimensions");
  }

  const { url, previewUrl } = input;
  if (
    !ownPathname(url, userId) ||
    (previewUrl !== null && !ownPathname(previewUrl, userId))
  ) {
    throw new InvalidUploadError("Invalid upload URL");
  }

  let file: Awaited<ReturnType<typeof head>>;
  let preview: Awaited<ReturnType<typeof head>> | null;
  try {
    [file, preview] = await Promise.all([
      head(url),
      previewUrl !== null ? head(previewUrl) : Promise.resolve(null),
    ]);
  } catch {
    throw new InvalidUploadError("Upload not found");
  }

  // Defence in depth: never delete (or save) a blob outside the user's prefix.
  if (
    !isOwnBlobPathname(file.pathname, userId) ||
    (preview !== null && !isOwnBlobPathname(preview.pathname, userId))
  ) {
    throw new InvalidUploadError("Invalid upload URL");
  }

  const urls = previewUrl !== null ? [url, previewUrl] : [url];
  try {
    const mimeType = normalizeMime(file.contentType);
    const contentType = contentTypeForMime(mimeType);
    if (
      !UPLOAD_MIME_TYPES.includes(mimeType) ||
      !contentType ||
      mimeType !== normalizeMime(input.mimeType)
    ) {
      throw new InvalidUploadError("Unsupported file type");
    }
    if (preview !== null && normalizeMime(preview.contentType) !== PREVIEW_MIME_TYPE) {
      throw new InvalidUploadError("Invalid upload preview");
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new InvalidUploadError("Invalid upload size");
    }

    const row = await insertWithinSaveLimit(
      userId,
      (tx) =>
        tx.link.create({
          data: {
            url,
            // Strip control characters (a NUL would fail the insert).
            title: titleFromFileName(input.name.replace(/[\u0000-\u001f\u007f]/g, "")),
            favicon: UPLOAD_FAVICON,
            domain: uploadDomain(),
            contentType,
            mimeType,
            thumbnail: previewUrl,
            fileKey: file.pathname,
            fileSize: file.size,
            width: input.width,
            height: input.height,
            duration: input.duration,
            description: null,
            userId,
            ...(opts?.folderId !== undefined ? { folderId: opts.folderId } : {}),
          },
        }),
      { bytes: file.size },
    );
    return mapRowToLink(row);
  } catch (error) {
    await discardBlobs(userId, file.pathname, urls);
    if (isForeignKeyConstraintError(error)) throw new FolderNotFoundError();
    throw error;
  }
}
