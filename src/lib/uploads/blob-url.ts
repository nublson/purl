export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isBlobUrl(url: string): boolean {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== "https:") return false;
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

/** True for `users/<userId>/…` paths with no traversal. */
export function isOwnBlobPathname(pathname: string, userId: string): boolean {
  if (!userId || userId.includes("/") || userId.includes("\\")) return false;
  if (pathname.startsWith("/") || pathname.includes("\\")) return false;
  const prefix = `users/${userId}/`;
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  if (!rest) return false;
  return !pathname.split("/").some((segment) => segment === "..");
}
