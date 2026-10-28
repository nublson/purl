"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { useLeavingLinks } from "@/lib/leaving-links";
import { ARRIVE, ARRIVE_ICON, ARRIVE_LATE } from "@/lib/motion";
import { previewOpenDelay, trackPreviewOpen } from "@/lib/link-preview-warmth";
import {
  linkSelection,
  useIsLinkSelected,
  useIsSelectionActive,
} from "@/lib/link-selection";
import { deleteLinkKeepingFocus } from "@/lib/delete-link-focus";
import { haptic } from "@/lib/haptics";
import { useAudioView } from "@/hooks/use-audio-player";
import { isViewerKind, linkKind } from "@/lib/link-kind";
import {
  consumeReturningFocus,
  mediaViewer,
  useIsMediaOpen,
} from "@/lib/media-viewer";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import { linkSecondLine } from "@/lib/upload-meta";
import { Link as LinkType } from "@/utils/links";
import dynamic from "next/dynamic";
import * as React from "react";
import { AudioRowIcon, AudioRowSecondLine, AudioRowToggle } from "./audio-row";
import {
  FolderBadge,
  FolderLinkButton,
  FolderTagLabel,
  useFolderBadgeArrival,
  useFolderTag,
  useLinkFolder,
} from "./folder-tag";
import { HapticTarget } from "./haptic-target";
import { LinkIcon } from "./link-icon";
import { LinkPreview } from "./link-preview";
import { MediaAnchor, ROW_ICON_RADIUS } from "./media-face-anchor";
import { MediaOpenButton } from "./media-open-button";
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

/**
 * The row's link or media button: over the whole row, under its controls.
 * ring-inset: the list clips each row to its box (content-visibility), so a
 * ring drawn outside it would be cut to the corners.
 */
const OPENER_CLASS =
  "absolute inset-0 z-0 w-full rounded-md outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset";

const LinkMenu = dynamic(() => import("./link-menu").then((m) => m.LinkMenu), {
  loading: () => <div className="size-8" aria-hidden />,
});

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
  { link, className, eagerFavicon, arriving = false, ...rest },
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
  // The landing page's demo is read-only: no selecting, no menu. The
  // actions slot stays (empty) so the row keeps its height.
  const demo = useIsDemo();
  const selecting = useIsSelectionActive() && !demo;
  const selected = useIsLinkSelected(link.id);
  const folderTag = useFolderTag(link);
  const linkFolder = useLinkFolder(link);
  const badgeArrives = useFolderBadgeArrival(folderTag);
  // An image or video pearl opens the media viewer (its row's icon is what
  // the viewer morphs out of); a page opens in a new tab. The landing demo
  // has no viewer: its rows are links. An audio pearl never opens the
  // viewer: a click on its row plays and pauses it (the demo's too).
  const kind = linkKind(link);
  const audio = kind === "audio";
  const media = !demo && isViewerKind(kind);
  // An audio pearl's row is a view of its playback: what its hover preview
  // starts plays on once the preview closes, until the row leaves.
  useAudioView(audio ? link.id : null);
  const viewerOpen = useIsMediaOpen(link.id);
  const longPressRef = React.useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  // Set when a long-press selected the row: swallows the click that follows.
  const longPressedRef = React.useRef(false);
  // A touch tap that selects (the checkbox, or the row while selecting):
  // the lift after a long-press only ticks, since the long-press already
  // toggled the row.
  const tapToSelect = ({ shiftKey }: { shiftKey: boolean }) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    haptic("selection");
    linkSelection.toggle(link.id, { shiftKey });
  };
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Whether the current preview was opened by hover (vs keyboard focus).
  const openedByPointerRef = React.useRef(false);
  const descriptionId = React.useId();
  const folderLabelId = React.useId();
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const setAnchor = React.useCallback((el: HTMLElement | null) => {
    anchorRef.current = el;
  }, []);
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
      // Nor over the media viewer this row (or another) just opened.
      if (mediaViewer.getSnapshot().currentId !== null) return;
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

  // Entering selection mode, or opening this pearl in the media viewer,
  // closes an open preview.
  React.useEffect(() => {
    if (selecting || viewerOpen) setPreviewOpen(false);
  }, [selecting, viewerOpen]);

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
      // An audio row's is its play button (`data-audio-toggle`).
      siblingsSelector:
        '[data-cy="link-item"] > a[href], [data-cy="link-item"] > [data-pearl-button], [data-cy="link-item"] > [data-audio-toggle]',
      byKeyboard,
      onDeleted: notifyLinksChanged,
    });

  // The description, then the folder (the badge is only its emoji).
  const describedBy =
    [link.description && descriptionId, folderTag && folderLabelId]
      .filter(Boolean)
      .join(" ") || undefined;
  // Keyboard users get the same preview mouse users get on hover.
  // Not when the media viewer hands focus back on close: the row's icon is
  // still morphing back, and nobody navigated here.
  const openPreviewOnFocus = (event: React.FocusEvent<HTMLElement>) => {
    if (consumeReturningFocus()) return;
    if (!event.currentTarget.matches(":focus-visible")) return;
    clearCloseTimer();
    openedByPointerRef.current = false;
    setPreviewOpen(true);
  };
  const closePreviewOnBlur = () => {
    if (!hoveringPreviewRef.current) setPreviewOpen(false);
  };

  // An audio pearl that's loaded (playing or paused) draws its play/pause
  // mark in the icon's place.
  const glyph = audio ? (
    <AudioRowIcon link={link}>
      <LinkIcon link={link} size="row" eagerFavicon={eagerFavicon} />
    </AudioRowIcon>
  ) : (
    <LinkIcon link={link} size="row" eagerFavicon={eagerFavicon} />
  );
  const icon = arriving ? (
    <Typography component="span" className={cn("flex", ARRIVE_ICON)}>
      {glyph}
    </Typography>
  ) : (
    glyph
  );

  // The row's own handlers: a long-press selects on touch; a mouse or pen
  // previews.
  const hostHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (demo || event.pointerType !== "touch") return;
      // A press on the row's actions, or inside a portal (the open menu,
      // whose React events bubble through here), isn't a long-press on
      // the row: opening the menu takes the lift away from the row, so
      // the press would select it behind the menu.
      const target = event.target as Element;
      if (
        !event.currentTarget.contains(target) ||
        target.closest("[data-row-actions]")
      ) {
        return;
      }
      cancelLongPress();
      longPressedRef.current = false;
      longPressRef.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          longPressRef.current = null;
          longPressedRef.current = true;
          linkSelection.toggle(link.id);
          haptic("selection");
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const press = longPressRef.current;
      if (
        press &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
          LONG_PRESS_SLOP
      ) {
        cancelLongPress();
      }
    },
    onPointerUp: cancelLongPress,
    onPointerCancel: cancelLongPress,
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
      // The long-press selected the row; no browser menu on top of it.
      if (longPressedRef.current) event.preventDefault();
    },
    // Previews follow a real mouse only. A tap sends iOS Safari's
    // emulated mouseover first, and it holds the tap's click until any
    // short timer started then has run (it waits to see whether the page
    // reacts to the "hover"): the preview's timers delayed every row tap
    // by up to their 400ms. Pointer events report the actual pointer, so
    // touch is skipped while a mouse or a hovering pen still previews.
    onPointerEnter: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") return;
      hoveringActionsRef.current = false;
      scheduleOpen();
    },
    onPointerLeave: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") return;
      hoveringActionsRef.current = false;
      scheduleClose();
    },
  };

  // A long-press selected the row: true once, for the click that follows.
  const consumeLongPress = () => {
    if (!longPressedRef.current) return false;
    longPressedRef.current = false;
    return true;
  };

  const content = (
    <Item
      ref={ref}
      data-cy="link-item"
      data-selected={selected || undefined}
      className={cn(
        // border-0: Item's 1px border is for its outline variant and its own
        // focus ring; this row uses neither (the link draws the focus ring).
        // Two columns: the actions float over the row's end (see
        // ItemActions), so the text takes the whole width.
        "w-full border-0 p-2 gap-4 grid min-h-12 grid-cols-[20px_1fr] relative max-md:min-h-14 max-md:grid-cols-[24px_1fr] max-md:py-3 transition-none hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
        // The row's color, opaque (its tints are translucent over the page),
        // for what sits on it: the floating actions and the folder badge.
        "[--row-bg:var(--color-background)] hover:[--row-bg:color-mix(in_oklab,var(--color-accent)_40%,var(--color-background))] data-[state=open]:[--row-bg:color-mix(in_oklab,var(--color-accent)_40%,var(--color-background))] has-data-[state=open]:[--row-bg:color-mix(in_oklab,var(--color-accent)_40%,var(--color-background))]",
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
      {...hostHandlers}
      {...rest}
    >
      {audio ? (
        // An audio pearl's row plays and pauses it (it never opens the
        // viewer); while selecting, a click toggles the row instead.
        <AudioRowToggle
          ref={setAnchor}
          link={link}
          aria-describedby={describedBy}
          aria-hidden={selecting || undefined}
          tabIndex={selecting ? -1 : undefined}
          className={cn(OPENER_CLASS, "cursor-pointer")}
          onClick={(event) => {
            if (consumeLongPress()) return true;
            if (!selecting) return false;
            linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
            return true;
          }}
          onFocus={openPreviewOnFocus}
          onBlur={closePreviewOnBlur}
        />
      ) : media ? (
        <MediaOpenButton
          ref={setAnchor}
          link={link}
          preset="snappy"
          selecting={selecting}
          consumeLongPress={consumeLongPress}
          aria-describedby={describedBy}
          // While selecting, the row's checkbox is the keyboard and screen
          // reader control; a click anywhere on the row toggles it.
          aria-hidden={selecting || undefined}
          tabIndex={selecting ? -1 : undefined}
          className={cn(OPENER_CLASS, "cursor-pointer")}
          onClick={(event) =>
            linkSelection.toggle(link.id, { shiftKey: event.shiftKey })
          }
          onFocus={openPreviewOnFocus}
          onBlur={closePreviewOnBlur}
        />
      ) : (
        <a
          ref={setAnchor}
          href={link.url}
          aria-label={`${link.title} (opens in new tab)`}
          aria-describedby={describedBy}
          target="_blank"
          rel="noopener noreferrer"
          // While selecting, the row's checkbox is the keyboard and screen
          // reader control; a click anywhere on the row toggles it.
          aria-hidden={selecting || undefined}
          tabIndex={selecting ? -1 : undefined}
          className={OPENER_CLASS}
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
            data-cy="row-favicon"
            className={cn(
              // Morphs into the checkbox: it shrinks to the checkbox's size
              // (16/20) as it fades while the checkbox settles from the
              // favicon's (20/16), so they read as one shape changing size.
              // The badge rides along. Reduced motion keeps the fade only.
              "absolute inset-0 transition-[opacity,scale] duration-150 ease-out-strong",
              demo
                ? null
                : selecting
                  ? "opacity-0 motion-safe:scale-80"
                  : // Keyboard focus only: a mouse click leaves focus on the
                    // checkbox, and the favicon must come back once you move away.
                    // While its icon morphs to or from the media viewer it
                    // stays whole, hovered or not: the morph lands in it.
                    "[@media(hover:hover)]:group-hover/item:opacity-0 motion-safe:[@media(hover:hover)]:group-hover/item:scale-80 group-has-[:focus-visible]/media:opacity-0 motion-safe:group-has-[:focus-visible]/media:scale-80 group-has-[[data-pearl-morphing]]/item:opacity-100! group-has-[[data-pearl-morphing]]/item:scale-100!",
            )}
          >
            {/* A media pearl's icon is the viewer's morph anchor (the
                badge stays outside it: it overhangs the icon's corner). */}
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
            {/* Home, with folder tags on: the link's folder on the favicon's
                corner. Fades with the favicon when the checkbox shows. */}
            {folderTag ? (
              <FolderBadge
                key={folderTag.id}
                folder={folderTag}
                arrive={badgeArrives || arriving}
              />
            ) : null}
          </div>
          {demo ? null : (
            <>
              <Checkbox
                checked={selected}
                aria-label={`Select ${link.title}`}
                className={cn(
                  "absolute inset-0.5 z-10 size-4 cursor-pointer bg-background max-md:size-5 transition-[opacity,scale,box-shadow] duration-150 ease-out-strong",
                  selecting
                    ? "opacity-100"
                    : // Hidden while the icon morphs (the favicon shows).
                      "opacity-0 motion-safe:scale-125 focus-visible:opacity-100 motion-safe:focus-visible:scale-100 [@media(hover:hover)]:group-hover/item:opacity-100 motion-safe:[@media(hover:hover)]:group-hover/item:scale-100 group-has-[[data-pearl-morphing]]/item:opacity-0!",
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
              {/* Touch: the checkbox's tap, with a tick. Over its hit area (its
              after: extension included); the checkbox's own onClick stays
              for the mouse and keyboard. */}
              <HapticTarget
                className="-inset-x-2.5 -inset-y-1.5 z-[11]"
                onTap={tapToSelect}
              />
            </>
          )}
        </div>
      </ItemMedia>
      {/* min-w-0: the grid's 1fr column can then shrink below a one-line
          title's full width (truncate can't wrap), so it ends in an
          ellipsis instead of widening the row. */}
      <ItemContent className="min-w-0 self-start pt-1.5 max-md:pt-1">
        {/* Capped at the column, so the title shrinks to an ellipsis and
            the domain and tag stay in view. */}
        {/* overflow-visible: the folder tag sits on the text's baseline, a
            hair below the line box (line-clamp's overflow would clip it). */}
        <ItemTitle className="max-w-full overflow-visible">
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
              "font-medium text-accent-foreground",
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
            {audio ? <AudioRowSecondLine link={link} /> : linkSecondLine(link)}
          </Typography>
          {/* The favicon's folder badge, named for screen readers (and the
              link's description). */}
          {folderTag ? (
            <FolderTagLabel id={folderLabelId} folder={folderTag} />
          ) : null}
        </ItemTitle>
      </ItemContent>
      {/* Floated over the row's end instead of holding a column, so the
          title takes the whole width. Always shown on touch (covering the
          title's end); with a pointer that hovers, only on hover, keyboard
          focus or with the menu open. Its backing is the row's color,
          fading in over 24px, so it covers the text's end cleanly. Hidden
          (and inert) while selecting. */}
      <ItemActions
        data-row-actions
        inert={selecting}
        className={cn(
          (selecting || demo) && "invisible",
          "absolute inset-y-0 end-0 rounded-e-md bg-(--row-bg) ps-6 pe-2 [mask-image:linear-gradient(to_right,transparent,black_24px)]",
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
        {demo ? (
          <div className="size-8" aria-hidden />
        ) : (
          <>
            {linkFolder ? <FolderLinkButton folder={linkFolder} /> : null}
            <LinkMenu link={link} onDelete={deleteRow} />
          </>
        )}
      </ItemActions>
      {/* While selecting, a tap anywhere on the row toggles it, with a
          tick (touch). Also where a long-press's lift lands, once it has
          started selecting. Above the link, under the checkbox. */}
      {selecting ? (
        <HapticTarget className="z-[5]" onTap={tapToSelect} />
      ) : null}
    </Item>
  );

  return (
    <LinkPreview
      link={link}
      eagerThumbnail={Boolean(eagerFavicon)}
      placement={demo ? "below" : "beside"}
      pdfThumbnail={!demo}
      folder={folderTag}
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
