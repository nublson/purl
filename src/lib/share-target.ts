/**
 * Web Share Target: what another app shares to the installed Purl (a link,
 * text, files) arrives as a multipart `POST /share` (`share_target` in
 * public/manifest.json). The service worker (an installed app) or the
 * `/share` route (dev, a browser without the worker) reads the form with
 * `parseShareForm`, the worker stashes the files (`stashSharedFiles`), and
 * both answer a 303 to `shareLandingPath`: Home, where the `share` params
 * are read back (`readShareParams`), the URLs saved through the paste flow
 * and the files taken from the stash (`takeSharedFiles`) and uploaded.
 *
 * No `server-only` and no DOM: the route, the worker and the page share it.
 * iOS Safari ignores `share_target`.
 */

import { isSameLinkUrl } from "@/lib/omnibox";

/** The share form's address (the manifest's `share_target.action`). */
export const SHARE_PATH = "/share";

/** Where a share lands, with one `share` param per URL and `files` for files. */
export const SHARE_LANDING = "/home";
export const SHARE_PARAM = "share";
const FILES_MARKER = "files";

/** The one Cache API cache the worker stashes shared files in. */
const SHARE_CACHE = "purl-share-target";
const STASH_PREFIX = `${SHARE_PATH}/stash/`;
const NAME_HEADER = "X-Purl-File-Name";
const MODIFIED_HEADER = "X-Purl-File-Modified";

/** Toasted on landing when the share held neither a link nor a file. */
export const NOTHING_SHARED_MESSAGE = "Nothing to save. Share a link or a file.";
/** Toasted when files were shared but the page finds none in the stash. */
export const SHARED_FILES_LOST_MESSAGE =
  "Couldn't receive the shared files. Try again.";

export type ParsedShare = {
  /** The http(s) URLs shared, distinct, in order. */
  urls: string[];
  files: File[];
};

export type ShareParams = {
  urls: string[];
  /** Files were shared (and should be in the stash). */
  files: boolean;
};

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
/** Prose punctuation that ends up glued to a URL's end. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>]+$/;

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

/** The http(s) URLs in `text`, distinct, in order, without the prose around them. */
function urlsIn(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = asHttpUrl(match[0].replace(TRAILING_PUNCTUATION, ""));
    if (url && !urls.some((seen) => isSameLinkUrl(seen, url))) urls.push(url);
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

/**
 * The page a share is sent to: `/home?share=<url>&share=<url>&share=files`.
 * A share with nothing usable lands on `/home?share=`, so the page can say so.
 */
export function shareLandingPath(share: {
  urls: string[];
  hasFiles: boolean;
}): string {
  const params = new URLSearchParams();
  for (const url of share.urls) params.append(SHARE_PARAM, url);
  if (share.hasFiles) params.append(SHARE_PARAM, FILES_MARKER);
  if (!params.size) params.append(SHARE_PARAM, "");
  return `${SHARE_LANDING}?${params}`;
}

/** The `share` params of a landing URL (`searchParams.getAll`), read back. */
export function readShareParams(values: string[]): ShareParams {
  const urls: string[] = [];
  let files = false;
  for (const value of values) {
    if (value === FILES_MARKER) {
      files = true;
      continue;
    }
    const url = asHttpUrl(value.trim());
    if (url && !urls.some((seen) => isSameLinkUrl(seen, url))) urls.push(url);
  }
  return { urls, files };
}

/**
 * Keeps the shared files for the page (the worker answers the share before
 * any page exists to hand them to): one cache, one entry per file with its
 * type and name. Replaces whatever an earlier share left.
 */
export async function stashSharedFiles(files: File[]): Promise<void> {
  await caches.delete(SHARE_CACHE);
  if (files.length === 0) return;
  const cache = await caches.open(SHARE_CACHE);
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        `${STASH_PREFIX}${index}`,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            [NAME_HEADER]: encodeURIComponent(file.name),
            [MODIFIED_HEADER]: String(file.lastModified),
          },
        }),
      ),
    ),
  );
}

/** The stashed files, in the order shared, and the stash emptied. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARE_CACHE);
  const entries = await Promise.all(
    (await cache.keys()).map(async (request) => {
      const index = Number(request.url.slice(request.url.lastIndexOf("/") + 1));
      const response = await cache.match(request);
      if (!response) return null;
      const name = decodeURIComponent(response.headers.get(NAME_HEADER) ?? "");
      const lastModified = Number(response.headers.get(MODIFIED_HEADER));
      const file = new File([await response.blob()], name || "file", {
        type: response.headers.get("Content-Type") ?? "",
        lastModified: Number.isFinite(lastModified) ? lastModified : Date.now(),
      });
      return { index, file };
    }),
  );
  await caches.delete(SHARE_CACHE);
  return entries
    .filter((entry): entry is { index: number; file: File } => entry !== null)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.file);
}
