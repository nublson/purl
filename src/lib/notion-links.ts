import type { ResolvedLink } from "notionic";
import { STATIC_PAGES } from "@/lib/static-pages";

function isPurlHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "purl.live" || host.endsWith(".purl.live");
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
 * A link to purl.live (or a subdomain) as a same-tab path; notionic opens every
 * absolute URL in a new tab. Other links are returned as they are.
 */
export function sameSiteLink(link: ResolvedLink): ResolvedLink {
  if (!link.external) return link;
  const url = new URL(link.href);
  if (!isPurlHost(url.hostname)) return link;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Never `//host` or `/\host`, which browsers read as another site.
  return /^\/(?![/\\])/.test(path) ? { href: path, external: false } : link;
}
