/**
 * Web Share Target: what another app shares to the installed Purl (a link,
 * text, files) arrives as a multipart `POST /share` (`share_target` in
 * public/manifest.json). The service worker (an installed app) or the
 * `/share` route (dev, a browser without the worker) reads the form with
 * `parseShareForm` and answers a 303 to `SHARE_LANDING` (Home, with a flag):
 * the worker hands the share over through the Cache API (`stashShare`: the
 * URLs and the files), the route through a short-lived cookie
 * (`shareCookie`: the URLs and how many files it couldn't keep). Home takes
 * whichever is there (`takeShare`), saves the URLs through the paste flow
 * and uploads the files.
 *
 * The URL itself never carries the links: anyone can send a signed-in user
 * to a Purl address, and a link in it would be saved as if they had shared
 * it. The stash and the cookie are same-origin, so only Purl's own answer
 * to a share can fill them.
 *
 * No `server-only` and no DOM at import: the route, the worker and the page
 * share it. iOS Safari ignores `share_target`.
 */

import { isSameLinkUrl } from "@/lib/omnibox";

/** The share form's address (the manifest's `share_target.action`). */
export const SHARE_PATH = "/share";

/** Where a share lands: Home, flagged so it looks for the handed-over share. */
export const SHARE_PARAM = "share";
export const SHARE_LANDING = `/home?${SHARE_PARAM}=1`;

/** The one Cache API cache the worker hands a share over in. */
const SHARE_CACHE = "purl-share-target";
const STASH_URL = `${SHARE_PATH}/stash`;
const STASH_FILE_PREFIX = `${STASH_URL}/`;
const NAME_HEADER = "X-Purl-File-Name";
const MODIFIED_HEADER = "X-Purl-File-Modified";

/** The cookie the route hands a share over in; one minute, the page's read clears it. */
const SHARE_COOKIE = "purl-share";
const SHARE_COOKIE_MAX_AGE = 60;

/** Toasted on landing when nothing was handed over (the flag alone, a cookie expired). */
export const SHARE_LOST_MESSAGE = "Couldn't receive what was shared. Try again.";
/** Toasted when files were shared but none reached the page. */
export const SHARED_FILES_LOST_MESSAGE =
  "Couldn't receive the shared files. Try again.";
/** Toasted when the share held neither a link nor a file. */
export const NOTHING_SHARED_MESSAGE = "Nothing to save. Share a link or a file.";

export type ParsedShare = {
  /** The http(s) URLs shared, distinct, in order. */
  urls: string[];
  files: File[];
};

/** What travels from the share to the page: the URLs, and how many files were shared. */
export type SharePayload = { urls: string[]; fileCount: number };

/** What the page takes: the payload, plus the files that reached it. */
export type ReceivedShare = SharePayload & { files: File[] };

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
/** Prose punctuation that ends up glued to a URL's end. */
const TRAILING_PUNCTUATION = /[.,;:!?\]}>]$/;

function asHttpUrl(text: string): string | null {
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.includes(".") || url.hostname === "localhost"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/**
 * `raw` without the prose punctuation glued to its end. A closing
 * parenthesis stays while the URL has one open (Wikipedia's `_(disambiguation)`
 * pages), and goes when it closes the sentence's.
 */
function trimUrlEnd(raw: string): string {
  let url = raw;
  for (;;) {
    if (TRAILING_PUNCTUATION.test(url)) {
      url = url.slice(0, -1);
    } else if (url.endsWith(")") && count(url, ")") > count(url, "(")) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

function pushDistinct(urls: string[], url: string | null): void {
  if (url && !urls.some((seen) => isSameLinkUrl(seen, url))) urls.push(url);
}

/** The http(s) URLs in `text`, distinct, in order, without the prose around them. */
function urlsIn(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    pushDistinct(urls, asHttpUrl(trimUrlEnd(match[0])));
  }
  return urls;
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * What the share form holds: the `url` field when it is an http(s) URL,
 * else the http(s) URLs in `text` (Android apps put the link there, often
 * with prose around it), else in `title`; and the `files`.
 */
export function parseShareForm(form: FormData): ParsedShare {
  const url = asHttpUrl(field(form, "url"));
  const urls = url
    ? [url]
    : [field(form, "text"), field(form, "title")]
        .map(urlsIn)
        .find((found) => found.length > 0) ?? [];
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  return { urls, files };
}

export function sharePayload(share: ParsedShare): SharePayload {
  return { urls: share.urls, fileCount: share.files.length };
}

/** A payload read back from the stash or the cookie, checked; null when it isn't one. */
export function parseSharePayload(raw: string | null | undefined): SharePayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { urls: rawUrls, fileCount } = parsed as Record<string, unknown>;
  if (!Array.isArray(rawUrls)) return null;
  if (typeof fileCount !== "number" || !Number.isInteger(fileCount) || fileCount < 0) {
    return null;
  }
  const urls: string[] = [];
  for (const entry of rawUrls) {
    if (typeof entry === "string") pushDistinct(urls, asHttpUrl(entry));
  }
  return { urls, fileCount };
}

/**
 * The `Set-Cookie` value the route hands a share over with: same-origin,
 * a minute, readable by the page (not HttpOnly), and off again once read.
 */
export function shareCookie(share: ParsedShare, { secure }: { secure: boolean }): string {
  const value = encodeURIComponent(JSON.stringify(sharePayload(share)));
  return `${SHARE_COOKIE}=${value}; Path=/; Max-Age=${SHARE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function takeShareCookie(): SharePayload | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${SHARE_COOKIE}=`));
  if (!entry) return null;
  document.cookie = `${SHARE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  try {
    return parseSharePayload(decodeURIComponent(entry.slice(SHARE_COOKIE.length + 1)));
  } catch {
    return null;
  }
}

/**
 * Keeps a share for the page (the worker answers the share before any page
 * exists to hand it to): one cache, the payload and one entry per file with
 * its type and name. Replaces whatever an earlier share left.
 */
export async function stashShare(share: ParsedShare): Promise<void> {
  await caches.delete(SHARE_CACHE);
  const cache = await caches.open(SHARE_CACHE);
  await Promise.all([
    cache.put(
      STASH_URL,
      new Response(JSON.stringify(sharePayload(share)), {
        headers: { "Content-Type": "application/json" },
      }),
    ),
    ...share.files.map((file, index) =>
      cache.put(
        `${STASH_FILE_PREFIX}${index}`,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            [NAME_HEADER]: encodeURIComponent(file.name),
            [MODIFIED_HEADER]: String(file.lastModified),
          },
        }),
      ),
    ),
  ]);
}

async function takeStash(): Promise<ReceivedShare | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(SHARE_CACHE);
  let payload: SharePayload | null = null;
  const entries: { index: number; file: File }[] = [];
  await Promise.all(
    (await cache.keys()).map(async (request) => {
      const response = await cache.match(request);
      if (!response) return;
      const path = new URL(request.url).pathname;
      if (path === STASH_URL) {
        payload = parseSharePayload(await response.text());
        return;
      }
      if (!path.startsWith(STASH_FILE_PREFIX)) return;
      const name = decodeURIComponent(response.headers.get(NAME_HEADER) ?? "");
      const lastModified = Number(response.headers.get(MODIFIED_HEADER));
      entries.push({
        index: Number(path.slice(STASH_FILE_PREFIX.length)),
        file: new File([await response.blob()], name || "file", {
          type: response.headers.get("Content-Type") ?? "",
          lastModified: Number.isFinite(lastModified) ? lastModified : Date.now(),
        }),
      });
    }),
  );
  await caches.delete(SHARE_CACHE);
  if (!payload) return null;
  const files = entries.sort((a, b) => a.index - b.index).map((entry) => entry.file);
  return { ...(payload as SharePayload), files };
}

/**
 * The share handed over to this page, from the worker's stash or the route's
 * cookie, both emptied; null when neither holds one. A failure reading the
 * stash counts as nothing handed over.
 */
export async function takeShare(): Promise<ReceivedShare | null> {
  const stashed = await takeStash().catch(() => null);
  const cookie = takeShareCookie();
  if (stashed) return stashed;
  return cookie ? { ...cookie, files: [] } : null;
}
