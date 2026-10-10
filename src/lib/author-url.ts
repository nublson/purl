export const AUTHOR_FALLBACK_URL = "https://github.com/nublson";

/**
 * Where the footer's "@nublson" links: NUBLSON_URL when it's an https URL,
 * else the GitHub profile. Plain module (no server-only) so e2e can import it.
 */
export function getAuthorUrl(
  env: string | undefined = process.env.NUBLSON_URL,
): string {
  const value = env?.trim();
  if (!value) return AUTHOR_FALLBACK_URL;
  try {
    return new URL(value).protocol === "https:" ? value : AUTHOR_FALLBACK_URL;
  } catch {
    return AUTHOR_FALLBACK_URL;
  }
}
