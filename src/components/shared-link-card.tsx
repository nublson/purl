import type { ReactNode } from "react";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import { isMediaKind, linkKind } from "@/lib/link-kind";
import { linkSecondLine } from "@/lib/upload-meta";
import { LinkIcon } from "./link-icon";
import { AudioFace, ImageFace, VideoFace } from "./media-card-face";
import { MediaOpenButton } from "./media-open-button";
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
 * lines at most) and domain. Cards keep their natural height. An image,
 * video or audio pearl's card opens the media viewer (its face is the
 * morph's anchor, clipping itself, so the card doesn't crop the morph);
 * a page's card is a link to a new tab.
 */
export function SharedLinkCard({
  link,
  eagerThumbnail = false,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
}) {
  const kind = linkKind(link);
  if (kind === "audio") {
    // The player's controls can't sit inside the card's button: the card
    // is a frame holding the strip and a button over everything else
    // (`after:`), so clicks beside the controls still open the viewer. The
    // frame draws the button's focus ring, as the owner's card does.
    return (
      <div
        data-cy="link-card"
        className={cn(
          LINK_CARD_FRAME,
          "relative overflow-visible has-[[data-pearl-button]:focus-visible]:ring-3 has-[[data-pearl-button]:focus-visible]:ring-ring",
        )}
      >
        <AudioFace link={link} anchored />
        <MediaOpenButton
          link={link}
          selecting={false}
          className="flex w-full cursor-pointer flex-col text-start outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          <LinkCardStrip link={link} />
        </MediaOpenButton>
      </div>
    );
  }
  if (isMediaKind(kind)) {
    return (
      <MediaOpenButton
        link={link}
        selecting={false}
        data-cy="link-card"
        // w-full: a button shrinks to its content (the face has none of
        // its own: it takes the card's width), unlike the link it replaces.
        className={cn(LINK_CARD_FRAME, "w-full cursor-pointer overflow-visible text-start")}
      >
        <LinkCardContent link={link} eagerThumbnail={eagerThumbnail} mediaAnchor />
      </MediaOpenButton>
    );
  }
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
 * What a link card shows, shared by both grids, by the link's kind: an image
 * or a video is the media alone, full-bleed at its ratio (the card's label
 * is the title); audio is the player strip, then the title strip; a page is
 * the thumbnail (16:10, full-bleed), then the favicon, the title (two lines)
 * and the domain.
 */
export function LinkCardContent({
  link,
  eagerThumbnail = false,
  badge,
  ownerControls = false,
  mediaAnchor = false,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
  /** On the favicon's corner (the owner's grid: the link's folder badge). */
  badge?: ReactNode;
  /** The owner's card: its checkbox and menu sit over the top edge. */
  ownerControls?: boolean;
  /** The media viewer opens from this card: the face is its morph anchor. */
  mediaAnchor?: boolean;
}) {
  switch (linkKind(link)) {
    case "image":
      return (
        <ImageFace link={link} eager={eagerThumbnail} badge={badge} anchored={mediaAnchor} />
      );
    case "video":
      return <VideoFace link={link} badge={badge} anchored={mediaAnchor} />;
    case "audio":
      return (
        <>
          <AudioFace link={link} controls={ownerControls} anchored={mediaAnchor} />
          <LinkCardStrip link={link} badge={badge} />
        </>
      );
    default: {
      const thumbnailSrc = link.thumbnail
        ? safeRemoteImgSrc(link.thumbnail)
        : null;
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
          <LinkCardStrip link={link} badge={badge} />
        </>
      );
    }
  }
}

/** A card's text: the favicon (with the badge), the title and the domain. */
function LinkCardStrip({ link, badge }: { link: LinkType; badge?: ReactNode }) {
  return (
    <span className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2 gap-y-1 p-3 md:gap-x-3 md:p-4">
      {/* Centered on the title's first line: a box one title line tall
          (text-sm leading-normal, so 1lh = that line), nudged 1px down
          to the lowercase letters' middle, where the eye reads it. */}
      <span className="flex h-[1lh] translate-y-px items-center text-sm leading-normal">
        <span className="relative size-4">
          {/* Favicons get a faint 1px edge so dark ones read on the card. */}
          <span
            className="flex size-4 items-center justify-center overflow-hidden *:size-4 [&_img]:outline [&_img]:-outline-offset-1 [&_img]:outline-black/10 dark:[&_img]:outline-white/10"
          >
            <LinkIcon link={link} size="small" />
          </span>
          {badge}
        </span>
      </span>
      <Typography
        component="span"
        size="small"
        className="line-clamp-2 wrap-anywhere font-medium text-foreground"
      >
        {link.title}
      </Typography>
      <Typography
        component="span"
        size="small"
        className="col-start-2 truncate"
      >
        {linkSecondLine(link)}
      </Typography>
    </span>
  );
}
