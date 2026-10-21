import TurndownService from "turndown";

/**
 * The page's `<main>` as Markdown: no scripts, styles, SVG or buttons, and
 * links kept. Falls back to the whole body when there's no `<main>`.
 */
export function htmlToMarkdown(html: string, origin = ""): string {
  const main = /<main[\s>][\s\S]*<\/main>/i.exec(html)?.[0] ?? html;
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  // Added rules outrank Turndown's built-in ones (remove() doesn't).
  td.addRule("drop-media", {
    filter: (node) =>
      node.nodeName === "IMG" || node.nodeName.toLowerCase() === "svg",
    replacement: () => "",
  });
  // Links with no text of their own (a stretched row link) say nothing.
  td.addRule("drop-empty-links", {
    filter: (node) => node.nodeName === "A" && !(node.textContent ?? "").trim(),
    replacement: () => "",
  });
  td.remove(["script", "style", "button", "noscript", "template"]);
  const markdown = td
    .turndown(main)
    .replace(/\]\(\//g, `](${origin}/`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return markdown + "\n";
}

/** The page's `<title>`, for a leading heading when the body has no h1. */
export function htmlTitle(html: string): string | null {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}
