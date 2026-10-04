import type { ReactNode } from "react";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import { formatDomain } from "@/utils/formatter";
import type { Link as LinkType } from "@/utils/links";
import { LinkIcon } from "./link-icon";
import { LinkPreviewThumbnail } from "./link-preview-thumbnail";
import { Typography } from "./typography";

/**
 * A link card's frame (the shared folder's and the owner's grid): rounded,
 * a hairline edge that firms up on hover, pressed to 0.98.
 */
export const LINK_CARD_FRAME =
  "flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 outline-none transition-[box-shadow,scale] duration-150 ease-out focus-visible:ring-3 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-ring [@media(hover:hover)]:hover:ring-foreground/25";

/**
 * A link in the shared folder's grid: the page's thumbnail full-bleed on
 * top (favicon on a tint when there's none), then the favicon, title (two
 * lines at most) and domain. Cards keep their natural height.
 */
export function SharedLinkCard({
  link,
  eagerThumbnail = false,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
}) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${link.title} (opens in new tab)`}
      data-cy="link-card"
      className={LINK_CARD_FRAME}
    >
      <LinkCardContent link={link} eagerThumbnail={eagerThumbnail} />
    </a>
  );
}

/**
 * What a link card shows, shared by both grids: the thumbnail (16:10,
 * full-bleed), then the favicon, the title (two lines) and the domain.
 * `read` (the owner's grid) steps it back like a read row: a regular,
 * muted title and a grey favicon.
 */
export function LinkCardContent({
  link,
  eagerThumbnail = false,
  read = false,
  tag,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
  read?: boolean;
  /** Under the domain (the owner's grid: the link's folder tag). */
  tag?: ReactNode;
}) {
  const thumbnailSrc = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  return (
    <>
      {/* 16:10, full-bleed: the card's rounded corners clip it. */}
      <LinkPreviewThumbnail
        link={link}
        thumbnailSrc={thumbnailSrc}
        eagerThumbnail={eagerThumbnail}
        // The card's border is the image's edge here: drop the thumbnail's
        // own 1px outline so the edge isn't doubled.
        className="aspect-[16/10] rounded-none [&_img]:outline-0"
      />
      <span className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2 gap-y-1 p-3 md:gap-x-3 md:p-4">
        {/* Centered on the title's first line: a box one title line tall
            (text-sm leading-normal, so 1lh = that line), nudged 1px down
            to the lowercase letters' middle, where the eye reads it. */}
        <span className="flex h-[1lh] translate-y-px items-center text-sm leading-normal">
          {/* Favicons get a faint 1px edge so dark ones read on the card. */}
          <span
            className={cn(
              "flex size-4 items-center justify-center overflow-hidden *:size-4 [&_img]:outline [&_img]:-outline-offset-1 [&_img]:outline-black/10 dark:[&_img]:outline-white/10",
              read && "opacity-50 grayscale",
            )}
          >
            <LinkIcon link={link} size="small" />
          </span>
        </span>
        <Typography
          component="span"
          size="small"
          className={cn(
            "line-clamp-2 wrap-anywhere",
            read
              ? "font-normal text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {link.title}
        </Typography>
        <Typography
          component="span"
          size="small"
          className="col-start-2 truncate"
        >
          {formatDomain(link.domain)}
        </Typography>
        {tag ? <span className="col-start-2 mt-1 flex">{tag}</span> : null}
      </span>
    </>
  );
}
