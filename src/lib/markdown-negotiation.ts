import { STATIC_PAGES } from "./static-pages";

/** The public pages that can answer in Markdown: public path → route key. */
export const MARKDOWN_PAGES: Readonly<Record<string, string>> = {
  "/": "home",
  ...Object.fromEntries(STATIC_PAGES.map(({ path, slug }) => [path, slug])),
};

/** `/api/markdown/<key>` for a public path, or null when it has no Markdown. */
export function markdownRoute(pathname: string): string | null {
  const key = MARKDOWN_PAGES[pathname];
  return key ? `/api/markdown/${key}` : null;
}

/** The public path behind a route key (the inverse of MARKDOWN_PAGES). */
export function pathForMarkdownKey(key: string): string | null {
  return (
    Object.entries(MARKDOWN_PAGES).find(([, k]) => k === key)?.[0] ?? null
  );
}

/** Whether the request asks for Markdown (browsers never do). */
export function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  return accept
    .split(",")
    .some((part) => part.trim().toLowerCase().startsWith("text/markdown"));
}
