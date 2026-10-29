export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Checks the URL's shape only: https, no port, host ending in
 * `.public.blob.vercel-storage.com`. Any Vercel Blob store matches, not just
 * Purl's; callers that need Purl's own store verify it with `head()` and
 * Purl's token.
 */
export function isBlobUrl(url: string): boolean {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== "https:" || parsed.port) return false;
  return parsed.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX);
}

/** The blob's pathname, percent-decoded, without the leading slash. */
export function blobPathnameOf(url: string): string | null {
  if (!isBlobUrl(url)) return null;
  const parsed = parse(url);
  if (!parsed) return null;
  try {
    return decodeURIComponent(parsed.pathname).replace(/^\//, "");
  } catch {
    return null;
  }
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * True for `users/<userId>/…` paths whose remaining segments are all
 * non-empty, made of `[A-Za-z0-9._-]` only (so no percent-escapes that could
 * turn into `..` once the path is put back in a URL), and not `.` or `..`.
 */
export function isOwnBlobPathname(pathname: string, userId: string): boolean {
  if (!SAFE_SEGMENT.test(userId) || userId === "." || userId === "..") {
    return false;
  }
  const prefix = `users/${userId}/`;
  if (!pathname.startsWith(prefix)) return false;
  const segments = pathname.slice(prefix.length).split("/");
  return segments.every(
    (segment) =>
      SAFE_SEGMENT.test(segment) && segment !== "." && segment !== "..",
  );
}
