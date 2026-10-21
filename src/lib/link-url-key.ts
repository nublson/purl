/**
 * A key that is equal for URLs that point at the same link: ignores the
 * scheme, a leading `www.`, a trailing slash and letter case in the host.
 * A non-default port is part of the key (`:8443` is another service from the
 * same host); a scheme's default port (`:443` on https) is not.
 * Unparseable input is returned as is.
 */
export function linkUrlKey(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const port = url.port ? `:${url.port}` : "";
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${port}${path}${url.search}`;
  } catch {
    return raw;
  }
}
