import { MAX_PASTED_URLS } from "@/lib/limits";
import { isSameLinkUrl, omniboxSaveUrl } from "@/lib/omnibox";

export type PastedUrls = {
  /** The distinct URLs, in the order they were pasted. */
  urls: string[];
  /** Pieces of the paste that weren't URLs (labels, stray words). */
  skipped: number;
  /** More than `MAX_PASTED_URLS`: the paste is refused, nothing is saved. */
  tooMany: boolean;
};

/**
 * The URLs in pasted text, for saving several links at once. Splits on
 * whitespace only, so a URL that contains a comma (map links) or another URL
 * (web.archive.org/web/…/https://site.com) stays whole; a trailing comma or
 * semicolon after a URL is dropped. Duplicates collapse like "Already saved"
 * does, and anything that isn't a URL is counted as skipped.
 */
export function parsePastedUrls(text: string): PastedUrls {
  const urls: string[] = [];
  let skipped = 0;

  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/[,;]+$/, "");
    if (!token) continue;

    const normalized = omniboxSaveUrl(token);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    // Keep an http(s) URL as pasted; a bare domain gets its https:// form.
    const url = /^https?:\/\//i.test(token) ? token : normalized;
    if (!urls.some((seen) => isSameLinkUrl(seen, url))) urls.push(url);
  }

  return { urls, skipped, tooMany: urls.length > MAX_PASTED_URLS };
}
