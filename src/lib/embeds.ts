import type { Link } from "@/utils/links";
import { getYouTubeEmbedUrl } from "@/utils/youtube";

/** Page pearls only (web pages and YouTube) can be shown live; uploads and other media never. */
export function canEmbed(link: Pick<Link, "contentType" | "upload">): boolean {
  return (
    !link.upload &&
    (link.contentType === "WEB" || link.contentType === "YOUTUBE")
  );
}

/** What a live pearl's frame loads: YouTube's no-cookie embed, else the page itself. */
export function embedSrc(link: Pick<Link, "url">): string {
  return getYouTubeEmbedUrl(link.url) ?? link.url;
}

/**
 * The media viewer's box for a live page: 16:10 on screens wider than tall,
 * 3:4 otherwise (a phone), so the page gets height. A fixed shape: the page
 * lays out at the box's real size.
 */
export function embedBoxRatio(viewport: {
  width: number;
  height: number;
}): "16 / 10" | "3 / 4" {
  return viewport.width > viewport.height ? "16 / 10" : "3 / 4";
}
