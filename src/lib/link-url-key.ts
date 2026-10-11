/**
 * A key that is equal for URLs that point at the same link: ignores the
 * scheme, a leading `www.`, a trailing slash and letter case in the host.
 * Unparseable input is returned as is.
 */
export function linkUrlKey(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${url.search}`;
  } catch {
    return raw;
  }
}
