import { STATIC_PAGES } from "@/lib/static-pages";

export type NotionLink = { href: string; external: boolean };

const PLAIN_ID = /[0-9a-f]{32}$/i;
const DASHED_ID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNotionHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "notion.so" ||
    host === "www.notion.so" ||
    host.endsWith(".notion.site")
  );
}

function isPurlHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "purl.live" || host.endsWith(".purl.live");
}

/** The page id (32 lowercase hex, no dashes) in a Notion page URL, or null. */
export function notionPageIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isNotionHost(parsed.hostname)) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const match = last.match(PLAIN_ID) ?? last.match(DASHED_ID);
  return match ? match[0].replace(/-/g, "").toLowerCase() : null;
}

/** Notion page id (no dashes, lowercase) → path, for published static pages. */
export function buildPageIdToPath(
  pages: readonly { id: string; slug: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const page of pages) {
    const entry = STATIC_PAGES.find((p) => p.slug === page.slug);
    if (entry) map.set(page.id.replace(/-/g, "").toLowerCase(), entry.path);
  }
  return map;
}

/**
 * How a link from Notion content should render: a same-tab link, an external
 * one (new tab), or null for text without a link (empty or unsafe).
 */
export function classifyNotionLink(
  href: string | null | undefined,
  pageIdToPath: ReadonlyMap<string, string>,
): NotionLink | null {
  const value = href?.trim();
  if (!value) return null;

  if (value.startsWith("//")) return null;
  if (value.startsWith("/") || value.startsWith("#")) {
    return { href: value, external: false };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol === "mailto:") return { href: value, external: false };
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  if (isPurlHost(url.hostname)) {
    return {
      href: `${url.pathname}${url.search}${url.hash}`,
      external: false,
    };
  }

  const pageId = notionPageIdFromUrl(value);
  const path = pageId ? pageIdToPath.get(pageId) : undefined;
  if (path) return { href: path, external: false };

  return { href: value, external: true };
}
