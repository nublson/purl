const FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";
const FAVICON_SIZE = "64";

export function getDefaultFaviconUrl(domain: string): string {
  return `${FAVICON_BASE}${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`;
}
