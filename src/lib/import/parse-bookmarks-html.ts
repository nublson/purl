import { flattenFolderPath } from "./normalize";
import type { ImportItem } from "./types";

const ROOT_FOLDER_NAMES = new Set([
  "bookmarks bar",
  "bookmarks toolbar",
  "bookmarks menu",
  "other bookmarks",
  "mobile bookmarks",
  "favorites",
  "favourites",
  "favorites bar",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const TAG_NAME = /(dl|h3|a)(?![\w-])/iy;
const CLOSERS = { h3: /<\/h3\s*>/gi, a: /<\/a\s*>/gi };
// Deeper folder nesting than any real bookmark tree; keeps each link O(1).
const MAX_DEPTH = 64;

/** Index of the `>` ending a tag whose attributes start at `from`, skipping quoted values; -1 at end of text. */
function findTagEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === ">") return i;
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close === -1) return -1;
      i = close + 1;
    } else {
      i++;
    }
  }
  return -1;
}

const ATTRIBUTE = /(?<![\w-])([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

type Frame = { name: string; root: boolean };

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (match, body: string) => {
      if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? match;
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      return String.fromCodePoint(code);
    },
  );
}

function readAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const key = match[1].toLowerCase();
    if (attributes.has(key)) continue;
    attributes.set(key, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function plainText(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    if (open === -1) break;
    const close = html.indexOf(">", open + 1);
    out += html.slice(i, open);
    if (close === -1) {
      i = html.length;
      break;
    }
    i = close + 1;
  }
  out += html.slice(i);
  return decodeEntities(out).replace(/\s+/g, " ").trim();
}

/** `ADD_DATE` in seconds, milliseconds or microseconds; `null` when unusable. */
function readAddDate(value: string | undefined): Date | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reads a browser bookmarks export (Netscape HTML) without a DOM. Browser
 * roots at the top level (Bookmarks bar, Other bookmarks…) don't count as
 * folders. Returns unvalidated items; `cleanImportItems` checks them.
 */
export function parseBookmarksHtml(text: string): ImportItem[] {
  const items: ImportItem[] = [];
  const stack: Frame[] = [];
  let overflow = 0;
  let pending: Frame = { name: "", root: false };
  let folder: string | null | undefined;

  const currentFolder = (): string | null => {
    if (folder !== undefined) return folder;
    const named = stack.filter((frame) => frame.name !== "");
    const segments = named.map((frame) => frame.name);
    if (named[0]?.root) segments.shift();
    folder = flattenFolderPath(segments);
    return folder;
  };

  // Where each closing tag was last found (-1: none left in the text).
  const nextClose: Record<"h3" | "a", { at: number; end: number }> = {
    h3: { at: -2, end: 0 },
    a: { at: -2, end: 0 },
  };
  const findClose = (tag: "h3" | "a", from: number) => {
    const known = nextClose[tag];
    if (known.at === -1 || (known.at >= from && known.at !== -2)) return known;
    const re = CLOSERS[tag];
    re.lastIndex = from;
    const m = re.exec(text);
    known.at = m ? m.index : -1;
    known.end = m ? re.lastIndex : 0;
    return known;
  };

  let pos = 0;
  while (pos < text.length) {
    const lt = text.indexOf("<", pos);
    if (lt === -1) break;
    let i = lt + 1;
    const closing = text[i] === "/";
    if (closing) i++;
    TAG_NAME.lastIndex = i;
    const named = TAG_NAME.exec(text);
    if (!named) {
      pos = lt + 1;
      continue;
    }
    const tag = named[1].toLowerCase() as "dl" | "h3" | "a";
    const end = findTagEnd(text, TAG_NAME.lastIndex);
    if (end === -1) break; // truncated: the rest is inside an unfinished tag
    pos = end + 1;

    if (tag === "dl") {
      folder = undefined;
      if (closing) {
        if (overflow > 0) overflow--;
        else stack.pop();
      } else {
        if (stack.length >= MAX_DEPTH) overflow++;
        else stack.push(pending);
        pending = { name: "", root: false };
      }
      continue;
    }
    if (closing) continue;

    const close = findClose(tag, pos);
    if (close.at === -1) continue;
    const inner = text.slice(pos, close.at);
    const attributes = readAttributes(text.slice(TAG_NAME.lastIndex, end));
    pos = close.end;

    if (tag === "h3") {
      const name = plainText(inner);
      const flagged =
        attributes.get("personal_toolbar_folder") === "true" ||
        attributes.get("unfiled_bookmarks_folder") === "true";
      pending = {
        name,
        root: flagged || ROOT_FOLDER_NAMES.has(name.toLowerCase()),
      };
    } else {
      const url = attributes.get("href")?.trim();
      if (!url) continue;
      items.push({
        url,
        title: plainText(inner),
        folder: currentFolder(),
        createdAt: readAddDate(attributes.get("add_date")),
      });
    }
  }
  return items;
}
