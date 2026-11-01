import "server-only";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
// Entity-escaped text must not turn into live HTML in the Markdown.
const defaultEscape = td.escape.bind(td);
td.escape = (text: string) => defaultEscape(text).replace(/</g, "\\<");
td.remove([
  "script",
  "style",
  "iframe",
  "form",
  "nav",
  "button",
  "svg" as keyof HTMLElementTagNameMap,
]);

/** An absolute http(s) URL, or null. */
function resolveHttp(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim(), baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function extractArticle(
  html: string,
  baseUrl: string,
): { title: string | null; content: string } | null {
  const { document } = parseHTML(html);
  // Readability's own URL fixing needs a base; ours happens in the converter.
  if (!document.querySelector("base") && document.head) {
    const base = document.createElement("base");
    base.setAttribute("href", baseUrl);
    document.head.appendChild(base);
  }
  // linkedom's document is structurally compatible with Readability's.
  const doc = document as unknown as Document;
  if (!isProbablyReaderable(doc)) return null;
  const article = new Readability(doc).parse();
  if (!article?.content?.trim()) return null;
  return { title: article.title?.trim() || null, content: article.content };
}

export function extractReaderMarkdown(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const a of Array.from(document.querySelectorAll("a"))) {
    const href = resolveHttp(a.getAttribute("href"), baseUrl);
    if (href) a.setAttribute("href", href);
    else a.replaceWith(...Array.from(a.childNodes));
  }
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const src = resolveHttp(img.getAttribute("src"), baseUrl);
    if (src) img.setAttribute("src", src);
    else img.remove();
  }
  return td
    .turndown(document.body.innerHTML)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cutAt(buf: Buffer, limit: number): string {
  if (buf[limit] === 0x0a) return buf.subarray(0, limit).toString("utf8");
  let end = limit;
  // Back off to a character start so no multibyte character is split.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  const head = buf.subarray(0, end).toString("utf8");
  const nl = head.lastIndexOf("\n");
  return nl >= 0 ? head.slice(0, nl) : head;
}

const fenceCount = (text: string) => (text.match(/^```/gm) ?? []).length;

export function cutMarkdown(
  markdown: string,
  maxBytes: number,
): { markdown: string; truncated: boolean; bytes: number } {
  const buf = Buffer.from(markdown);
  if (buf.length <= maxBytes) {
    return { markdown, truncated: false, bytes: buf.length };
  }
  let cut = cutAt(buf, maxBytes);
  if (fenceCount(cut) % 2 === 1) {
    // Close the fence the cut left open, within the cap.
    cut = cutAt(buf, maxBytes - 4);
    if (fenceCount(cut) % 2 === 1) cut += "\n```";
  }
  return { markdown: cut, truncated: true, bytes: Buffer.byteLength(cut) };
}
