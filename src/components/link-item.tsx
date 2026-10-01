"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { previewOpenDelay, trackPreviewOpen } from "@/lib/link-preview-warmth";
import {
  deleteLinkWithUndo,
  LINK_DELETE_FADE_MS,
  usePendingLinkDeletes,
} from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import { formatDomain } from "@/utils/formatter";
import { Link as LinkType } from "@/utils/links";
import dynamic from "next/dynamic";
import * as React from "react";
import { LinkIcon } from "./link-icon";
import { LinkPreview } from "./link-preview";
import { Typography } from "./typography";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

// Loaded on demand: the menu (dropdown, edit dialog, form library) stays out
// of the initial bundle. The placeholder matches the menu trigger's size to
// avoid layout shift.
const LinkMenu = dynamic(
  () => import("./link-menu").then((m) => m.LinkMenu),
  { loading: () => <div className="size-8" aria-hidden /> },
);

interface LinkItemProps {
  link: LinkType;
  eagerFavicon?: boolean;
}

export const LinkItem = React.forwardRef<
  HTMLDivElement,
  LinkItemProps & React.ComponentPropsWithoutRef<typeof Item>
>(function LinkItem(
  {
    link,
    className,
    onMouseEnter,
    onMouseLeave,
    eagerFavicon,
    ...rest
  },
  ref,
) {
  const { notifyLinksChanged } = useLinksSyncActions();
  // Deleting is owned by `deleteLinkWithUndo` (it outlives this row): the
  // row fades while "fading", then `LinkGroup` hides it behind an Undo toast.
  const deletePhase = usePendingLinkDeletes().get(link.id);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Whether the current preview was opened by hover (vs keyboard focus).
  const openedByPointerRef = React.useRef(false);
  const descriptionId = React.useId();
  const anchorRef = React.useRef<HTMLAnchorElement>(null);
  const hoveringActionsRef = React.useRef(false);
  const hoveringPreviewRef = React.useRef(false);
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const scheduleOpen = React.useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();

    openTimerRef.current = setTimeout(() => {
      if (hoveringActionsRef.current) return;
      openedByPointerRef.current = true;
      setPreviewOpen(true);
    }, previewOpenDelay());
  }, [clearCloseTimer, clearOpenTimer]);

  const scheduleClose = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();

    closeTimerRef.current = setTimeout(() => {
      if (!hoveringPreviewRef.current) setPreviewOpen(false);
    }, 100);
  }, [clearCloseTimer, clearOpenTimer]);

  React.useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  // While this preview is open, other rows open theirs without the delay.
  React.useEffect(() => {
    if (!previewOpen) return;
    return trackPreviewOpen(() => setPreviewOpen(false), {
      viaPointer: openedByPointerRef.current,
    });
  }, [previewOpen]);

  const content = (
    <Item
      ref={ref}
      data-cy="link-item"
      className={cn(
        "w-full p-2 gap-4 grid grid-cols-[20px_1fr_auto] relative transition-none hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
        deletePhase === "fading" &&
          "pointer-events-none animate-out fade-out-0 slide-out-to-left-2 duration-200",
        className,
      )}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        hoveringActionsRef.current = false;
        scheduleOpen();
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        hoveringActionsRef.current = false;
        scheduleClose();
      }}
      {...rest}
    >
      <a
        ref={anchorRef}
        href={link.url}
        aria-label={`${link.title} (opens in new tab)`}
        aria-describedby={link.description ? descriptionId : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0 w-full rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring"
        onFocus={(event) => {
          // Keyboard users get the same preview mouse users get on hover.
          if (!event.currentTarget.matches(":focus-visible")) return;
          clearCloseTimer();
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
        className="relative mt-1.5 size-5 self-start rounded"
      >
        <LinkIcon link={link} size="default" eagerFavicon={eagerFavicon} />
      </ItemMedia>
      <ItemContent className="self-start pt-1.5">
        <ItemTitle>
          <Typography
            size="small"
            className="text-accent-foreground font-medium line-clamp-2 wrap-anywhere md:line-clamp-1"
          >
            {link.title}
          </Typography>
          <Typography
            component="span"
            size="small"
            className="text-muted-foreground font-normal hidden md:block"
          >
            {formatDomain(link.domain)}
          </Typography>
        </ItemTitle>
      </ItemContent>
      <ItemActions
        className="z-10 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 [@media(hover:hover)]:group-focus-within/item:opacity-100 group-data-[state=open]/item:opacity-100 has-data-[state=open]:opacity-100"
        onMouseEnter={() => {
          hoveringActionsRef.current = true;
          clearOpenTimer();
          clearCloseTimer();
        }}
        onMouseLeave={() => {
          hoveringActionsRef.current = false;
          scheduleOpen();
        }}
      >
        <LinkMenu
          link={link}
          onDelete={() => {
            const rows = Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-cy="link-item"] > a[href]',
              ),
            );
            const index = rows.indexOf(anchorRef.current as HTMLElement);
            const target =
              index >= 0 ? (rows[index + 1] ?? rows[index - 1] ?? null) : null;
            deleteLinkWithUndo(link.id, { onDeleted: notifyLinksChanged });
            // The row (and its menu trigger) unmounts once hidden; then move
            // focus to the neighboring row only if focus fell to the body.
            setTimeout(() => {
              requestAnimationFrame(() => {
                const active = document.activeElement;
                if (
                  target?.isConnected &&
                  (!active || active === document.body)
                ) {
                  target.focus();
                }
              });
            }, LINK_DELETE_FADE_MS);
          }}
        />
      </ItemActions>
    </Item>
  );

  return (
    <LinkPreview
      link={link}
      eagerThumbnail={Boolean(eagerFavicon)}
      open={previewOpen}
      onOpenChange={() => {
        // HoverCardTrigger is still present, but we fully control `open` from LinkItem mouse events.
      }}
      onPreviewMouseEnter={() => {
        hoveringPreviewRef.current = true;
        clearCloseTimer();
      }}
      onPreviewMouseLeave={() => {
        hoveringPreviewRef.current = false;
        scheduleClose();
      }}
    >
      {content}
    </LinkPreview>
  );
});
