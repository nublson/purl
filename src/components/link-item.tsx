"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { previewOpenDelay, trackPreviewOpen } from "@/lib/link-preview-warmth";
import {
  linkSelection,
  useIsLinkSelected,
  useIsSelectionActive,
} from "@/lib/link-selection";
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
import { Checkbox } from "./ui/checkbox";
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
/** Holding a row this long on a touch screen starts selecting. */
const LONG_PRESS_MS = 500;
/** Finger travel that turns a long-press into a scroll. */
const LONG_PRESS_SLOP = 10;

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
  // Selection mode (anything selected): every row shows its checkbox, a
  // click toggles the row instead of opening it, and row menus hide so
  // every action goes through the selection bar.
  const selecting = useIsSelectionActive();
  const selected = useIsLinkSelected(link.id);
  const longPressRef = React.useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  // Set when a long-press selected the row: swallows the click that follows.
  const longPressedRef = React.useRef(false);
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
      // No previews while selecting: the pointer is busy picking rows.
      if (linkSelection.selectedIds().length > 0) return;
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

  // Entering selection mode closes an open preview.
  React.useEffect(() => {
    if (selecting) setPreviewOpen(false);
  }, [selecting]);

  const cancelLongPress = React.useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }, []);
  React.useEffect(() => cancelLongPress, [cancelLongPress]);

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
      data-selected={selected || undefined}
      className={cn(
        "w-full p-2 gap-4 grid grid-cols-[20px_1fr_auto] relative transition-none hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
        selected && "bg-accent/60 hover:bg-accent/60",
        deletePhase === "fading" &&
          "pointer-events-none animate-out fade-out-0 slide-out-to-left-2 duration-200",
        className,
      )}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        cancelLongPress();
        longPressedRef.current = false;
        longPressRef.current = {
          x: event.clientX,
          y: event.clientY,
          timer: setTimeout(() => {
            longPressRef.current = null;
            longPressedRef.current = true;
            linkSelection.toggle(link.id);
          }, LONG_PRESS_MS),
        };
      }}
      onPointerMove={(event) => {
        const press = longPressRef.current;
        if (
          press &&
          Math.hypot(event.clientX - press.x, event.clientY - press.y) >
            LONG_PRESS_SLOP
        ) {
          cancelLongPress();
        }
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(event) => {
        // The long-press selected the row; no browser menu on top of it.
        if (longPressedRef.current) event.preventDefault();
      }}
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
        // While selecting, the row's checkbox is the keyboard and screen
        // reader control; a click anywhere on the row toggles it.
        aria-hidden={selecting || undefined}
        tabIndex={selecting ? -1 : undefined}
        className="absolute inset-0 z-0 w-full rounded-md outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring"
        onClick={(event) => {
          if (longPressedRef.current) {
            longPressedRef.current = false;
            event.preventDefault();
            return;
          }
          if (!selecting) return;
          event.preventDefault();
          linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
        }}
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
        className="group/media relative mt-1.5 size-5 self-start overflow-visible rounded"
      >
        {/* The favicon gives way to the checkbox on hover (pointer devices)
            or keyboard focus, and on every row while selecting. */}
        <div
          className={cn(
            "contents",
            selecting
              ? "*:invisible"
              : "[@media(hover:hover)]:group-hover/item:*:invisible group-focus-within/media:*:invisible",
          )}
        >
          <LinkIcon link={link} size="default" eagerFavicon={eagerFavicon} />
        </div>
        <Checkbox
          checked={selected}
          aria-label={`Select ${link.title}`}
          className={cn(
            "absolute inset-0.5 z-10 size-4 cursor-pointer bg-background",
            selecting
              ? "opacity-100"
              : "opacity-0 focus-visible:opacity-100 [@media(hover:hover)]:group-hover/item:opacity-100",
          )}
          onClick={(event) => {
            event.preventDefault();
            linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
          }}
        />
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
      {selecting ? null : (
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
      )}
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
