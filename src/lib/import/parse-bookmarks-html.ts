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

// `dl|h3|a` tags, closing or opening, with attributes (quoted values may hold `>`).
const TAG = /<(\/?)(dl|h3|a)(?![\w-])((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
const ATTRIBUTE = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

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
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
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
  let pending: Frame = { name: "", root: false };

  const currentFolder = (): string | null => {
    const named = stack.filter((frame) => frame.name !== "");
    const segments = named.map((frame) => frame.name);
    if (named[0]?.root) segments.shift();
    return flattenFolderPath(segments);
  };

  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(text)) !== null) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();

    if (tag === "dl") {
      if (closing) {
        stack.pop();
      } else {
        stack.push(pending);
        pending = { name: "", root: false };
      }
    } else {
      if (closing) continue;
      const closer = new RegExp(`</${tag}\\s*>`, "gi");
      closer.lastIndex = TAG.lastIndex;
      const close = closer.exec(text);
      if (!close) continue;
      const inner = text.slice(TAG.lastIndex, close.index);
      const attributes = readAttributes(match[3]);
      TAG.lastIndex = closer.lastIndex;

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
  }
  return items;
}
