import "server-only";

import { BlobNotFoundError, del, head, list } from "@vercel/blob";
import { insertWithinSaveLimit } from "@/lib/entitlements";
import { assertFolderOwned, FolderNotFoundError } from "@/lib/folders";
import { mapRowToLink } from "@/lib/links";
import { MAX_UPLOAD_PREVIEW_BYTES, UPLOAD_ROW_WINDOW_MS } from "@/lib/limits";
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

let warnedAboutBaseUrl = false;

/** The host of `BASE_URL` (an upload's domain): `purl.live`. */
function uploadDomain(): string {
  try {
    return new URL(process.env.BASE_URL as string).host;
  } catch {
    if (!warnedAboutBaseUrl) {
      warnedAboutBaseUrl = true;
      console.warn(
        "[createUploadForUser] BASE_URL is missing or invalid; uploads use purl.live as their domain",
      );
    }
    return "purl.live";
  }
}

/** `users/u1/c1/` for `users/u1/c1/a.png`. */
function directoryOf(pathname: string): string {
  return pathname.slice(0, pathname.lastIndexOf("/") + 1);
}

/** `a.png` for `users/u1/c1/a.png`. */
function fileNameOf(pathname: string): string {
  return pathname.slice(pathname.lastIndexOf("/") + 1);
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
 * checked against Blob itself: `head()` runs with Purl's token and must
 * answer with exactly the URL sent, so a URL from another store (or a
 * missing blob) fails, and the size counted against the storage cap is
 * Blob's. The preview must sit beside its file (same directory, named
 * `preview…`) and stay under `MAX_UPLOAD_PREVIEW_BYTES`, so a full-size file
 * can't ride along uncounted. A blob uploaded more than
 * `UPLOAD_ROW_WINDOW_MS` ago is refused (the sweep may be deleting it). Once
 * both heads succeed, any failure (expired, wrong
 * type, the save or storage limit, the folder gone, the database) deletes
 * the blobs before rethrowing. Saving one blob again (a retried request)
 * returns its pearl unchanged; two uploads of one file are two pearls.
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
  const filePath = ownPathname(url, userId);
  if (!filePath) throw new InvalidUploadError("Invalid upload URL");
  if (previewUrl !== null) {
    const previewPath = ownPathname(previewUrl, userId);
    if (
      !previewPath ||
      previewUrl === url ||
      previewPath === filePath ||
      directoryOf(previewPath) !== directoryOf(filePath) ||
      !fileNameOf(previewPath).startsWith("preview")
    ) {
      throw new InvalidUploadError("Invalid upload preview");
    }
  }

  let file: Awaited<ReturnType<typeof head>>;
  let preview: Awaited<ReturnType<typeof head>> | null;
  try {
    [file, preview] = await Promise.all([
      head(url),
      previewUrl !== null ? head(previewUrl) : Promise.resolve(null),
    ]);
  } catch (error) {
    // Anything else (an outage, a rate limit) is a 500 the client can retry.
    if (error instanceof BlobNotFoundError) {
      throw new InvalidUploadError("Upload not found");
    }
    throw error;
  }

  // Pins Purl's store: Blob must answer for exactly these URLs. Defence in
  // depth too: never delete (or save) a blob outside the user's prefix.
  if (
    file.url !== url ||
    (preview !== null && preview.url !== previewUrl) ||
    !isOwnBlobPathname(file.pathname, userId) ||
    (preview !== null && !isOwnBlobPathname(preview.pathname, userId))
  ) {
    throw new InvalidUploadError("Invalid upload URL");
  }

  const urls = preview !== null ? [file.url, preview.url] : [file.url];
  try {
    // A blob past the row window may already be judged orphaned by the sweep
    // (which waits twice as long), so it can't become a pearl.
    const now = Date.now();
    const expired = (uploadedAt: Date) =>
      !(now - new Date(uploadedAt).getTime() <= UPLOAD_ROW_WINDOW_MS);
    if (expired(file.uploadedAt) || (preview !== null && expired(preview.uploadedAt))) {
      throw new InvalidUploadError("Upload expired");
    }
    const mimeType = normalizeMime(file.contentType);
    const contentType = contentTypeForMime(mimeType);
    if (
      !UPLOAD_MIME_TYPES.includes(mimeType) ||
      !contentType ||
      mimeType !== normalizeMime(input.mimeType)
    ) {
      throw new InvalidUploadError("Unsupported file type");
    }
    if (
      preview !== null &&
      (normalizeMime(preview.contentType) !== PREVIEW_MIME_TYPE ||
        !Number.isSafeInteger(preview.size) ||
        preview.size > MAX_UPLOAD_PREVIEW_BYTES)
    ) {
      throw new InvalidUploadError("Invalid upload preview");
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0) {
      throw new InvalidUploadError("Invalid upload size");
    }

    const row = await insertWithinSaveLimit(
      userId,
      (tx) =>
        tx.link.create({
          data: {
            url: file.url,
            // Strip control characters (a NUL would fail the insert).
            title: titleFromFileName(input.name.replace(/[\u0000-\u001f\u007f]/g, "")),
            favicon: UPLOAD_FAVICON,
            domain: uploadDomain(),
            contentType,
            mimeType,
            thumbnail: preview?.url ?? null,
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
      {
        bytes: file.size,
        // A retry of a save that went through: the same blob's pearl, as is.
        reuse: (tx) =>
          tx.link.findFirst({ where: { userId, fileKey: file.pathname } }),
      },
    );
    return mapRowToLink(row);
  } catch (error) {
    await discardBlobs(userId, file.pathname, urls);
    if (isForeignKeyConstraintError(error)) throw new FolderNotFoundError();
    throw error;
  }
}

/** What `deleteBlobsFor` needs of a row about to go (or gone). */
export type BlobOwningRow = {
  url: string;
  fileKey: string | null;
  thumbnail: string | null;
};

/**
 * Best effort, after the rows' delete has committed: removes the blobs of
 * the uploads among `rows` (each file and its preview) in one `del`. A URL
 * that one of the user's remaining rows still uses by `url` or `thumbnail`
 * is kept; other accounts' rows don't count (a public Blob URL saved as
 * someone else's page link can't keep the owner's file alive). Page links (no `fileKey`) are skipped, and so is anything not on
 * the Blob host. Never throws: a failure is logged and the blobs stay.
 */
export async function deleteBlobsFor(
  userId: string,
  rows: BlobOwningRow[],
): Promise<void> {
  if (!uploadsEnabled()) return;
  const urls = new Set<string>();
  for (const row of rows) {
    if (!row.fileKey) continue;
    for (const url of [row.url, row.thumbnail]) {
      if (url && isBlobUrl(url)) urls.add(url);
    }
  }
  if (urls.size === 0) return;
  try {
    const candidates = [...urls];
    const stillUsed = await prisma.link.findMany({
      where: {
        userId,
        OR: [{ url: { in: candidates } }, { thumbnail: { in: candidates } }],
      },
      select: { url: true, thumbnail: true },
    });
    for (const row of stillUsed) {
      urls.delete(row.url);
      if (row.thumbnail) urls.delete(row.thumbnail);
    }
    if (urls.size === 0) return;
    await del([...urls]);
  } catch (error) {
    console.error("[uploads] del failed", error);
  }
}

/** Blob's `list` page size (its maximum). */
const LIST_PAGE_SIZE = 1000;

/**
 * Best effort, when an account is deleted: removes every blob under the
 * user's prefix (`users/<userId>/`), a page at a time. A page whose `del`
 * fails is logged and skipped; a failed `list` ends the pass. Never throws.
 */
export async function deleteUserBlobs(userId: string): Promise<void> {
  if (!uploadsEnabled()) return;
  try {
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: `users/${userId}/`,
        cursor,
        limit: LIST_PAGE_SIZE,
      });
      if (page.blobs.length > 0) {
        try {
          await del(page.blobs.map((blob) => blob.url));
        } catch (error) {
          console.error("[uploads] del failed", error);
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error("[uploads] del failed", error);
  }
}
