import type { Link } from "@/utils/links";

/** How a link's card face is drawn. */
export type LinkKind = "image" | "video" | "audio" | "embed" | "page";

/** Embeddable pages come first; then uploaded/saved media by content type. */
export function linkKind(link: Pick<Link, "contentType" | "embed">): LinkKind {
  if (link.embed) return "embed";
  switch (link.contentType) {
    case "IMAGE":
      return "image";
    case "VIDEO":
      return "video";
    case "AUDIO":
      return "audio";
    default:
      return "page";
  }
}

/** Image, video and audio pearls: the ones the media viewer shows. */
export function isMediaKind(kind: LinkKind): boolean {
  return kind === "image" || kind === "video" || kind === "audio";
}

const DEFAULT_RATIO = "16 / 10";
const MIN_RATIO = 1 / 3;
const MAX_RATIO = 3;

/** CSS `aspect-ratio` for a media card, clamped to between 1 / 3 and 3 / 1. */
export function cardAspectRatio(link: Pick<Link, "width" | "height">): string {
  const { width, height } = link;
  if (!width || !height || width <= 0 || height <= 0) return DEFAULT_RATIO;
  const ratio = width / height;
  if (ratio > MAX_RATIO) return "3 / 1";
  if (ratio < MIN_RATIO) return "1 / 3";
  return `${width} / ${height}`;
}
