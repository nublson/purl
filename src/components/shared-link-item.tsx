"use client";

import { useAudioView } from "@/hooks/use-audio-player";
import { isViewerKind, linkKind } from "@/lib/link-kind";
import { previewOpenDelay, trackPreviewOpen } from "@/lib/link-preview-warmth";
import {
  consumeReturningFocus,
  mediaViewer,
  useIsMediaOpen,
} from "@/lib/media-viewer";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import * as React from "react";
import { LinkIcon } from "./link-icon";
import { LinkPreview } from "./link-preview";
import { MediaAnchor, ROW_ICON_RADIUS } from "./media-face-anchor";
import { MediaOpenButton } from "./media-open-button";
import { Typography } from "./typography";
import { Item, ItemContent, ItemMedia, ItemTitle } from "./ui/item";

/**
 * A row on a shared folder page: the owner's `LinkItem`, read-only (no
 * checkbox, no menu). Same box, type and hover preview, so a shared folder
 * looks exactly like the owner's. PDFs get no preview: their thumbnail
 * goes through the signed-in PDF proxy. An image or video pearl opens the
 * media viewer, morphing out of its icon; a page opens a tab; an audio
 * pearl opens nothing for now, and plays from its hover preview's bar.
 */
export function SharedLinkItem({
  link,
  eagerFavicon = false,
}: {
  link: LinkType;
  eagerFavicon?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const openedByPointerRef = React.useRef(false);
  const hoveringPreviewRef = React.useRef(false);
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const descriptionId = React.useId();
  const hasPreview = link.contentType !== "PDF";
  const kind = linkKind(link);
  const media = isViewerKind(kind);
  // An audio pearl's row is a view of its playback: what its hover preview
  // starts plays on once the preview closes, until the row leaves.
  useAudioView(kind === "audio" ? link.id : null);
  const viewerOpen = useIsMediaOpen(link.id);

  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
  }, []);
  React.useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = () => {
    clearTimers();
    openTimerRef.current = setTimeout(() => {
      // Not over the media viewer this row (or another) just opened.
      if (mediaViewer.getSnapshot().currentId !== null) return;
      openedByPointerRef.current = true;
      setPreviewOpen(true);
    }, previewOpenDelay());
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimerRef.current = setTimeout(() => {
      if (!hoveringPreviewRef.current) setPreviewOpen(false);
    }, 100);
  };

  // Opening this pearl in the media viewer closes its preview.
  React.useEffect(() => {
    if (viewerOpen) setPreviewOpen(false);
  }, [viewerOpen]);

  // Keyboard users get the same preview mouse users get on hover; not when
  // the media viewer hands focus back on close (its icon is morphing back).
  const openPreviewOnFocus = (event: React.FocusEvent<HTMLElement>) => {
    if (consumeReturningFocus()) return;
    if (!hasPreview || !event.currentTarget.matches(":focus-visible")) return;
    clearTimers();
    openedByPointerRef.current = false;
    setPreviewOpen(true);
  };
  const closePreviewOnBlur = () => {
    if (!hoveringPreviewRef.current) setPreviewOpen(false);
  };
  const describedBy = link.description ? descriptionId : undefined;
  const openerClass =
    "absolute inset-0 z-0 w-full rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset";
  const icon = <LinkIcon link={link} size="row" eagerFavicon={eagerFavicon} />;

  // While this preview is open, other rows open theirs without the delay.
  React.useEffect(() => {
    if (!previewOpen) return;
    return trackPreviewOpen(() => setPreviewOpen(false), {
      viaPointer: openedByPointerRef.current,
    });
  }, [previewOpen]);

  const row = (
    <Item
      data-cy="link-item"
      // min-h-12: the owner's row gets its 48px from the menu button.
      className="relative grid min-h-12 w-full grid-cols-[20px_1fr] gap-4 border-0 p-2 transition-none hover:bg-accent/40 max-md:min-h-14 max-md:grid-cols-[24px_1fr] max-md:py-3"
      // Not on touch: iOS holds a tap's click while timers started by its
      // emulated mouseover run (see `LinkItem`). A mouse or pen previews.
      onPointerEnter={(event) => {
        if (hasPreview && event.pointerType !== "touch") scheduleOpen();
      }}
      onPointerLeave={(event) => {
        if (hasPreview && event.pointerType !== "touch") scheduleClose();
      }}
    >
      {kind === "audio" ? (
        // A plain surface: an audio pearl never opens the media viewer.
        <div aria-hidden className={openerClass} />
      ) : media ? (
        <MediaOpenButton
          link={link}
          preset="snappy"
          selecting={false}
          aria-describedby={describedBy}
          className={cn(openerClass, "cursor-pointer")}
          onFocus={openPreviewOnFocus}
          onBlur={closePreviewOnBlur}
        />
      ) : (
        <a
          href={link.url}
          aria-label={`${link.title} (opens in new tab)`}
          aria-describedby={describedBy}
          target="_blank"
          rel="noopener noreferrer"
          className={openerClass}
          onFocus={openPreviewOnFocus}
          onBlur={closePreviewOnBlur}
        />
      )}
      {link.description ? (
        <span id={descriptionId} className="sr-only">
          {link.description}
        </span>
      ) : null}
      <ItemMedia
        variant="image"
        // One title line tall, from the title's top: the favicon centers
        // on its first line, like LinkItem's.
        className="mt-1.5 h-lh w-5 self-start overflow-visible text-sm leading-normal max-md:mt-1 max-md:w-6 max-md:text-base max-md:leading-6"
      >
        {/* A media pearl's icon is the viewer's morph anchor. */}
        {media ? (
          <MediaAnchor
            link={link}
            radius={ROW_ICON_RADIUS}
            className="flex size-5 max-md:size-6"
          >
            {icon}
          </MediaAnchor>
        ) : (
          icon
        )}
      </ItemMedia>
      {/* min-w-0 / max-w-full: a one-line title shrinks to an ellipsis
          instead of widening the row (as in LinkItem). */}
      <ItemContent className="min-w-0 self-start pt-1.5 max-md:pt-1">
        <ItemTitle className="max-w-full">
          <Typography
            size="small"
            className="block truncate font-medium text-accent-foreground max-md:text-base max-md:leading-6"
          >
            {link.title}
          </Typography>
          <Typography
            component="span"
            size="small"
            className="hidden font-normal text-muted-foreground md:block"
          >
            {linkSecondLine(link)}
          </Typography>
        </ItemTitle>
      </ItemContent>
    </Item>
  );

  if (!hasPreview) return row;
  return (
    <LinkPreview
      link={link}
      eagerThumbnail={eagerFavicon}
      open={previewOpen}
      onPreviewMouseEnter={() => {
        hoveringPreviewRef.current = true;
        clearTimers();
      }}
      onPreviewMouseLeave={() => {
        hoveringPreviewRef.current = false;
        scheduleClose();
      }}
    >
      {row}
    </LinkPreview>
  );
}
