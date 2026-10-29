import type { ReactNode } from "react";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import { isViewerKind, linkKind } from "@/lib/link-kind";
import { linkSecondLine } from "@/lib/upload-meta";
import { LinkIcon } from "./link-icon";
import { AudioPlayer } from "./audio-player";
import { ImageFace, VideoFace } from "./media-card-face";
import { MediaOpenButton } from "./media-open-button";
import { LinkPreviewThumbnail } from "./link-preview-thumbnail";
import { Typography } from "./typography";

/**
 * A link card's frame (the shared folder's and the owner's grid): rounded,
 * a hairline edge that firms up on hover.
 */
const CARD_FRAME =
  "flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 outline-none transition-[box-shadow,scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring [@media(hover:hover)]:hover:ring-foreground/25";

/** A link card's frame, pressed to 0.98 (the whole card is its opener). */
export const LINK_CARD_FRAME = `${CARD_FRAME} active:scale-[0.98] motion-reduce:active:scale-100`;

/**
 * An audio card's frame: pressed to 0.98 like every card (its hero, its
 * checkbox, its surface while selecting), except through its controls
 * (`data-card-menu`: the transport, the track and the `⋯`), which have
 * their own press.
 */
export const AUDIO_CARD_FRAME = `${CARD_FRAME} active:scale-[0.98] has-[[data-card-menu]:active]:scale-100 motion-reduce:active:scale-100`;

/**
 * A link in the shared folder's grid: the page's thumbnail full-bleed on
 * top (favicon on a tint when there's none), then the favicon, title (two
 * lines at most) and domain. Cards keep their natural height. An image or
 * video pearl's card opens the media viewer (its face is the morph's
 * anchor, clipping itself, so the card doesn't crop the morph); an audio
 * pearl's card is its player (`AudioPlayer`); a page's card is a link
 * to a new tab.
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
    // A frame around the player, whose controls are its own: an audio
    // pearl never opens the media viewer.
    return (
      <div data-cy="link-card" className={AUDIO_CARD_FRAME}>
        <AudioPlayer link={link} surface="card" />
      </div>
    );
  }
  if (isViewerKind(kind)) {
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
 * is the title); a page is the thumbnail (16:10, full-bleed), then the
 * favicon, the title (two lines) and the domain. An audio pearl's card is
 * its player, which both grids draw themselves (`AudioPlayer`), never this.
 */
export function LinkCardContent({
  link,
  eagerThumbnail = false,
  badge,
  mediaAnchor = false,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
  /** On the favicon's corner (the owner's grid: the link's folder badge). */
  badge?: ReactNode;
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
