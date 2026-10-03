/**
 * Rules for the search field at the bottom of Home and folder pages: what
 * you type always searches your links, and when it looks like a URL the
 * field also offers to save it.
 */

/** File extensions that look like a domain ending but aren't one (`notes.txt`). */
const FILE_EXTENSIONS = new Set([
  "txt", "md", "pdf", "doc", "docx", "csv", "json", "xml", "yml", "yaml",
  "js", "ts", "tsx", "jsx", "css", "html", "htm", "py", "rb", "go", "rs",
  "png", "jpg", "jpeg", "gif", "svg", "webp", "mp3", "mp4", "mov", "zip",
  "exe", "dmg", "log", "sh",
]);

/** A single word with a dot and a letters-only ending, e.g. `example.com` or `blog.dev/post`. */
const BARE_URL = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,24})(?::\d+)?([/?#]\S*)?$/i;

/**
 * The URL to offer saving for `input`, or null when it's just a search:
 * anything starting with http(s):// that parses, or a single word with a
 * dot and a real-looking ending (bare domains get https://). Text with
 * spaces is always a search.
 */
export function omniboxSaveUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return url.hostname.includes(".") || url.hostname === "localhost"
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  const match = BARE_URL.exec(text);
  if (!match || FILE_EXTENSIONS.has(match[2].toLowerCase())) return null;
  try {
    return new URL(`https://${text}`).toString();
  } catch {
    return null;
  }
}

/**
 * Whether `a` and `b` are the same link for "Already saved": ignores the
 * scheme, a leading `www.`, a trailing slash and letter case in the host.
 */
export function isSameLinkUrl(a: string, b: string): boolean {
  const key = (raw: string) => {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const path = url.pathname.replace(/\/+$/, "");
      return `${host}${path}${url.search}`;
    } catch {
      return raw;
    }
  };
  return key(a) === key(b);
}
