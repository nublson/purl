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
