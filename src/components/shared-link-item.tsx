"use client";

import { previewOpenDelay, trackPreviewOpen } from "@/lib/link-preview-warmth";
import { formatDomain } from "@/utils/formatter";
import type { Link as LinkType } from "@/utils/links";
import * as React from "react";
import { LinkIcon } from "./link-icon";
import { LinkPreview } from "./link-preview";
import { Typography } from "./typography";
import { Item, ItemContent, ItemMedia, ItemTitle } from "./ui/item";

/**
 * A row on a shared folder page: the owner's `LinkItem`, read-only (no
 * checkbox, no menu). Same box, type and hover preview, so a shared folder
 * looks exactly like the owner's. PDFs get no preview: their thumbnail
 * goes through the signed-in PDF proxy.
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
      className="relative grid min-h-12 w-full grid-cols-[20px_1fr] gap-4 border-0 p-2 transition-none hover:bg-accent/40"
      onMouseEnter={hasPreview ? scheduleOpen : undefined}
      onMouseLeave={hasPreview ? scheduleClose : undefined}
    >
      <a
        href={link.url}
        aria-label={`${link.title} (opens in new tab)`}
        aria-describedby={link.description ? descriptionId : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0 w-full rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
        onFocus={(event) => {
          // Keyboard users get the same preview mouse users get on hover.
          if (!hasPreview || !event.currentTarget.matches(":focus-visible"))
            return;
          clearTimers();
          openedByPointerRef.current = false;
          setPreviewOpen(true);
        }}
        onBlur={() => {
          if (!hoveringPreviewRef.current) setPreviewOpen(false);
        }}
      />
      {link.description ? (
        <span id={descriptionId} className="sr-only">
          {link.description}
        </span>
      ) : null}
      <ItemMedia
        variant="image"
        // mt-2: on the middle of the title's lowercase letters, like
        // LinkItem's favicon.
        className="mt-2 size-5 self-start overflow-visible rounded"
      >
        <LinkIcon link={link} size="default" eagerFavicon={eagerFavicon} />
      </ItemMedia>
      <ItemContent className="self-start pt-1.5">
        <ItemTitle>
          <Typography
            size="small"
            className="line-clamp-2 font-medium wrap-anywhere text-accent-foreground md:line-clamp-1"
          >
            {link.title}
          </Typography>
          <Typography
            component="span"
            size="small"
            className="hidden font-normal text-muted-foreground md:block"
          >
            {formatDomain(link.domain)}
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
