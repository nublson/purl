"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { useLeavingLinks } from "@/lib/leaving-links";
import { ARRIVE, ARRIVE_ICON, ARRIVE_LATE } from "@/lib/motion";
import { previewOpenDelay, trackPreviewOpen } from "@/lib/link-preview-warmth";
import { setLinksRead, useIsLinkRead } from "@/lib/link-read-state";
import {
  linkSelection,
  useIsLinkSelected,
  useIsSelectionActive,
} from "@/lib/link-selection";
import { deleteLinkKeepingFocus } from "@/lib/delete-link-focus";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import { formatDomain } from "@/utils/formatter";
import { Link as LinkType } from "@/utils/links";
import dynamic from "next/dynamic";
import * as React from "react";
import { FolderTag, useFolderTag } from "./folder-tag";
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
  /**
   * The link was just saved: its real details arrive in place of the
   * saving placeholder (favicon, title, then domain fade in as their blur
   * clears).
   */
  arriving?: boolean;
}

export const LinkItem = React.forwardRef<
  HTMLDivElement,
  LinkItemProps & React.ComponentPropsWithoutRef<typeof Item>
>(function LinkItem(
  {
    link,
    className,
    eagerFavicon,
    arriving = false,
    ...rest
  },
  ref,
) {
  const { notifyLinksChanged } = useLinksSyncActions();
  // Deleting is owned by `deleteLinkWithUndo` (it outlives this row): the
  // row fades while "fading", then `LinkGroup` hides it behind an Undo toast.
  const deletePhase = usePendingLinkDeletes().get(link.id);
  // Moved out of the folder on screen: the same exit as a delete.
  const leaving = useLeavingLinks().get(link.id)?.phase === "fading";
  // Selection mode (anything selected): every row shows its checkbox, a
  // click toggles the row instead of opening it, and row menus hide so
  // every action goes through the selection bar.
  const selecting = useIsSelectionActive();
  const selected = useIsLinkSelected(link.id);
  // Read links stay in the list, faded back: opening one marks it read.
  const read = useIsLinkRead(link);
  const folderTag = useFolderTag(link);
  const markOpened = () => {
    if (!read) void setLinksRead([link.id], true);
  };
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

  const deleteRow = ({ byKeyboard }: { byKeyboard: boolean }) =>
    deleteLinkKeepingFocus({
      linkId: link.id,
      anchor: anchorRef.current,
      siblingsSelector: '[data-cy="link-item"] > a[href]',
      byKeyboard,
      onDeleted: notifyLinksChanged,
    });

  const content = (
    <Item
      ref={ref}
      data-cy="link-item"
      data-selected={selected || undefined}
      className={cn(
        // border-0: Item's 1px border is for its outline variant and its own
        // focus ring; this row uses neither (the link draws the focus ring).
        "w-full border-0 p-2 gap-4 grid grid-cols-[20px_1fr_auto] relative max-md:grid-cols-[24px_1fr_auto] max-md:py-3 transition-none hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
        // Touch: a long-press selects the row, so it must not also start a
        // text selection (which then spreads to the headings around it).
        "[@media(pointer:coarse)]:select-none",
        selected && "bg-accent/60 hover:bg-accent/60",
        (deletePhase === "fading" || leaving) &&
          "pointer-events-none animate-out fade-out-0 slide-out-to-left-2 duration-200",
        // Undo: back in the way it left (fade only with reduced motion).
        deletePhase === "restoring" &&
          "animate-in fade-in-0 slide-in-from-left-2 duration-200 ease-out-strong motion-reduce:[--tw-enter-translate-x:0]",
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
      // Previews follow a real mouse only. A tap sends iOS Safari's
      // emulated mouseover first, and it holds the tap's click until any
      // short timer started then has run (it waits to see whether the page
      // reacts to the "hover"): the preview's timers delayed every row tap
      // by up to their 400ms. Pointer events report the actual pointer, so
      // touch is skipped while a mouse or a hovering pen still previews.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        hoveringActionsRef.current = false;
        scheduleOpen();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        hoveringActionsRef.current = false;
        scheduleClose();
      }}
      {...rest}
    >
      <a
        ref={anchorRef}
        href={link.url}
        aria-label={`${link.title} (${read ? "read, " : ""}opens in new tab)`}
        aria-describedby={link.description ? descriptionId : undefined}
        target="_blank"
        rel="noopener noreferrer"
        // While selecting, the row's checkbox is the keyboard and screen
        // reader control; a click anywhere on the row toggles it.
        aria-hidden={selecting || undefined}
        tabIndex={selecting ? -1 : undefined}
        // ring-inset: the list clips each row to its box (content-visibility),
        // so a ring drawn outside the link would be cut to the corners.
        className="absolute inset-0 z-0 w-full rounded-md outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={(event) => {
          if (longPressedRef.current) {
            longPressedRef.current = false;
            event.preventDefault();
            return;
          }
          if (!selecting) {
            markOpened();
            return;
          }
          event.preventDefault();
          linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
        }}
        onAuxClick={(event) => {
          // Middle-click opens it in a background tab, selecting or not.
          if (event.button === 1) markOpened();
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
        // A slot exactly one title line tall (h-lh, in the title's type),
        // starting where the title does (pt-1.5): the favicon centers on
        // the title's first line, however many lines follow. The middle of
        // the line box reads as the middle of a title in mixed case; the
        // middle of the lowercase letters sat ~1.5px low beside capitals.
        // Phones: a 16px title on a 24px line, so a 24px favicon, 4px down.
        className="mt-1.5 h-lh w-5 self-start overflow-visible text-sm leading-normal max-md:mt-1 max-md:w-6 max-md:text-base max-md:leading-6"
      >
        <div className="group/media relative size-5 rounded max-md:size-6">
          {/* The favicon gives way to the checkbox on hover (pointer devices)
              or keyboard focus, and on every row while selecting. */}
          <div
            className={cn(
              // Cross-fades with the checkbox: a fast opacity swap, no movement.
              "contents *:transition-opacity *:duration-150 *:ease-out-strong",
              selecting
                ? "*:opacity-0"
                : // Keyboard focus only: a mouse click leaves focus on the
                  // checkbox, and the favicon must come back once you move away.
                  "[@media(hover:hover)]:group-hover/item:*:opacity-0 group-has-[:focus-visible]/media:*:opacity-0",
              // Read: the favicon loses its color and steps back with the title.
              read && !selecting && "*:opacity-50 *:grayscale",
            )}
          >
            {arriving ? (
              <Typography component="span" className={cn("flex", ARRIVE_ICON)}>
                <LinkIcon link={link} size="row" eagerFavicon={eagerFavicon} />
              </Typography>
            ) : (
              <LinkIcon link={link} size="row" eagerFavicon={eagerFavicon} />
            )}
          </div>
          <Checkbox
            checked={selected}
            aria-label={`Select ${link.title}`}
            className={cn(
              "absolute inset-0.5 z-10 size-4 cursor-pointer bg-background max-md:size-5 transition-[opacity,box-shadow] duration-150 ease-out-strong",
              selecting
                ? "opacity-100"
                : "opacity-0 focus-visible:opacity-100 [@media(hover:hover)]:group-hover/item:opacity-100",
            )}
            onClick={(event) => {
              event.preventDefault();
              // A long-press started here already toggled the row.
              if (longPressedRef.current) {
                longPressedRef.current = false;
                return;
              }
              linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
            }}
          />
        </div>
      </ItemMedia>
      {/* min-w-0: the grid's 1fr column can then shrink below a one-line
          title's full width (truncate can't wrap), so it ends in an
          ellipsis instead of widening the row. */}
      <ItemContent className="min-w-0 self-start pt-1.5 max-md:pt-1">
        {/* Capped at the column, so the title shrinks to an ellipsis and
            the domain and tag stay in view. */}
        <ItemTitle className="max-w-full">
          <Typography
            size="small"
            className={cn(
              // One line at every size, with a character-level ellipsis
              // (truncate, not line-clamp, which cuts at a word and leaves a
              // gap before the domain and tag).
              "block truncate",
              // Phones: the page's reading size (16px), like the search
              // field's, not desktop's 14px density.
              "max-md:text-base max-md:leading-6",
              // Read steps back in weight too, not just color: a cue that
              // survives low contrast and color-blindness (unread mail's bold).
              read
                ? "font-normal text-muted-foreground"
                : "font-medium text-accent-foreground",
              arriving && ARRIVE,
            )}
          >
            {link.title}
          </Typography>
          <Typography
            component="span"
            size="small"
            className={cn(
              "text-muted-foreground font-normal hidden md:block",
              arriving && ARRIVE_LATE,
            )}
          >
            {formatDomain(link.domain)}
          </Typography>
          {/* Home, with folder tags on: the link's folder, right after the
              domain (after the title on phones, which hide the domain). */}
          {folderTag ? <FolderTag folder={folderTag} /> : null}
        </ItemTitle>
      </ItemContent>
      {/* Stays in the layout while selecting (hidden and inert): its 32px
          button sets the row's 48px height, so the row can't shift. */}
      <ItemActions
        inert={selecting}
        className={cn(
          selecting && "invisible",
          "z-10 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 [@media(hover:hover)]:group-has-[:focus-visible]/item:opacity-100 group-data-[state=open]/item:opacity-100 has-data-[state=open]:opacity-100",
        )}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          hoveringActionsRef.current = true;
          clearOpenTimer();
          clearCloseTimer();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          hoveringActionsRef.current = false;
          scheduleOpen();
        }}
      >
        <LinkMenu link={link} onDelete={deleteRow} />
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
