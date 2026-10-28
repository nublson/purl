"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { useLongPress } from "@/hooks/use-long-press";
import { useLeavingLinks } from "@/lib/leaving-links";
import {
  linkSelection,
  useIsLinkSelected,
  useIsSelectionActive,
} from "@/lib/link-selection";
import { ARRIVE } from "@/lib/motion";
import { deleteLinkKeepingFocus } from "@/lib/delete-link-focus";
import { haptic } from "@/lib/haptics";
import { isViewerKind, linkKind } from "@/lib/link-kind";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import dynamic from "next/dynamic";
import * as React from "react";
import {
  FolderBadge,
  FolderLinkButton,
  FolderTagLabel,
  useFolderBadgeArrival,
  useFolderTag,
  useLinkFolder,
} from "./folder-tag";
import { AudioBar, markAudioHostPress } from "./audio-bar";
import { HapticTarget } from "./haptic-target";
import { MediaOpenButton } from "./media-open-button";
import { LINK_CARD_FRAME, LinkCardContent } from "./shared-link-card";
import { Checkbox } from "./ui/checkbox";

// Loaded on demand, like the rows' menu.
const LinkMenu = dynamic(() => import("./link-menu").then((m) => m.LinkMenu), {
  loading: () => <div className="size-8" aria-hidden />,
});

/** The card's link or media button: over the whole card, under its controls. */
const OPENER_CLASS =
  "absolute inset-0 z-0 cursor-pointer rounded-lg outline-none [-webkit-touch-callout:none]";

/**
 * A link in the owner's grid: the shared folder's card (same frame and
 * content), plus what the owner's rows do. A checkbox in the thumbnail's top
 * corner selects it (shown on hover or focus, and on every card while
 * selecting, when a click anywhere toggles the card); a long-press does
 * the same on touch. The row menu (`⋯`) sits in the other corner, on hover
 * or always on touch. An audio pearl's bar holds the checkbox itself (in
 * the sleeve's corner on hover, in its place while selecting); its menu
 * floats over the bar's top-right corner like every card's, on a backing
 * of the bar's surface. Deleted or moved-away cards fade out, and Undo
 * brings them back.
 */
export function LinkCard({
  link,
  eagerThumbnail = false,
  arriving = false,
  dayHeadingId,
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
  /** Just saved: it arrives (fades in as a blur clears). */
  arriving?: boolean;
  /**
   * The id of its day's heading ("Yesterday"): the grid isn't split into
   * per-day lists, so the link names its day as its description.
   */
  dayHeadingId?: string;
}) {
  const { notifyLinksChanged } = useLinksSyncActions();
  const deletePhase = usePendingLinkDeletes().get(link.id);
  const leaving = useLeavingLinks().get(link.id)?.phase === "fading";
  // The landing page's demo is read-only: no selecting or menu.
  const demo = useIsDemo();
  const selecting = useIsSelectionActive() && !demo;
  const selected = useIsLinkSelected(link.id);
  const folderTag = useFolderTag(link);
  const linkFolder = useLinkFolder(link);
  const badgeArrives = useFolderBadgeArrival(folderTag);
  const folderLabelId = React.useId();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The card's opener: a link to the page, or for an image or video pearl
  // the button that opens the media viewer (the demo has no viewer: its
  // cards are links). An audio pearl's card (the demo's too) has no
  // opener: its bar plays and expands in place, and never opens the viewer.
  const kind = linkKind(link);
  const audio = kind === "audio";
  const media = !demo && isViewerKind(kind);
  // An image or video face is the viewer's morph anchor: it rounds and
  // clips itself, so the card doesn't crop the morph back.
  const anchoredFace = media;
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const setAnchor = React.useCallback((el: HTMLElement | null) => {
    anchorRef.current = el;
  }, []);
  // The day, then the folder (the favicon's badge is only its emoji).
  const describedBy =
    [dayHeadingId, folderTag && folderLabelId].filter(Boolean).join(" ") || undefined;
  const { handlers: longPress, consumeLongPress } = useLongPress(() => {
    linkSelection.toggle(link.id);
    haptic("selection");
  });
  // A touch tap that selects (the checkbox, or the card while selecting):
  // the lift after a long-press only ticks, since the long-press already
  // toggled the card.
  const tapToSelect = ({ shiftKey }: { shiftKey: boolean }) => {
    if (consumeLongPress()) return;
    haptic("selection");
    linkSelection.toggle(link.id, { shiftKey });
  };

  // The checkbox's click (mouse, keyboard): no haptic, the touch tap is
  // `tapToSelect`'s.
  const clickToSelect = ({ shiftKey }: { shiftKey: boolean }) => {
    if (consumeLongPress()) return;
    linkSelection.toggle(link.id, { shiftKey });
  };

  const badge = folderTag ? (
    <FolderBadge key={folderTag.id} folder={folderTag} inCard arrive={badgeArrives} />
  ) : null;
  const menu = (
    <LinkMenu
      link={link}
      onOpenChange={setMenuOpen}
      onDelete={({ byKeyboard }) =>
        // Keyboard users land on the next card, not the page.
        deleteLinkKeepingFocus({
          linkId: link.id,
          anchor: anchorRef.current,
          // An audio card's is its bar's opener (`data-expand`).
          siblingsSelector:
            '[data-cy="link-card"] > a[href], [data-cy="link-card"] > [data-pearl-button], [data-cy="link-card"] [data-expand]',
          byKeyboard,
          onDeleted: notifyLinksChanged,
        })
      }
    />
  );
  // The menu shows on hover or focus with a pointer, always on touch, and
  // while it's open; hidden (and inert) while selecting: every action goes
  // through the selection bar then.
  const menuReveal = cn(
    "transition-opacity duration-150 ease-out-strong",
    selecting
      ? "invisible opacity-0"
      : menuOpen
        ? "opacity-100"
        : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:group-has-[:focus-visible]/card:opacity-100",
  );

  return (
    <div
      data-cy="link-card"
      data-selected={selected || undefined}
      className={cn(
        LINK_CARD_FRAME,
        // The opener (below) is the focus target: its ring is the card's.
        "group/card relative select-none has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring has-[[data-pearl-button]:focus-visible]:ring-3 has-[[data-pearl-button]:focus-visible]:ring-ring",
        selected &&
          "ring-2 ring-primary [@media(hover:hover)]:hover:ring-primary",
        anchoredFace && "overflow-visible",
        arriving && ARRIVE,
        (deletePhase === "fading" || leaving) &&
          "pointer-events-none animate-out fade-out-0 zoom-out-95 duration-200 ease-out-strong",
        deletePhase === "restoring" &&
          "animate-in fade-in-0 zoom-in-95 duration-200 ease-out-strong",
      )}
      {...longPress}
      // An open audio bar takes a press in this card's menu (a portal) for
      // one inside its card.
      onPointerDownCapture={
        audio ? (event) => markAudioHostPress(event.nativeEvent, link.id) : undefined
      }
      onPointerDown={(event) => {
        // A press on the menu button, or inside a portal (the open menu,
        // whose React events bubble through here), isn't a long-press on
        // the card. Not stopPropagation: Radix's menu needs that event to
        // reach the document, or its next outside tap counts as inside.
        const target = event.target as Element;
        if (
          demo ||
          !event.currentTarget.contains(target) ||
          target.closest("[data-card-menu]")
        ) {
          return;
        }
        longPress.onPointerDown(event);
      }}
    >
      {audio ? (
        // A plain surface under the bar: while selecting, a click on it
        // toggles the card (the bar's controls, its opener included, step
        // aside then). The card's focus anchor is the bar's opener.
        <div
          aria-hidden
          className={cn("absolute inset-0 z-0 rounded-lg", selecting && "cursor-pointer")}
          onClick={(event) => {
            if (consumeLongPress()) return;
            if (selecting) linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
          }}
        />
      ) : media ? (
        <MediaOpenButton
          ref={setAnchor}
          link={link}
          selecting={selecting}
          consumeLongPress={consumeLongPress}
          aria-describedby={describedBy}
          // While selecting, the checkbox is the keyboard and screen reader
          // control; a click anywhere on the card toggles it.
          aria-hidden={selecting || undefined}
          tabIndex={selecting ? -1 : undefined}
          className={OPENER_CLASS}
          onClick={(event) => linkSelection.toggle(link.id, { shiftKey: event.shiftKey })}
        />
      ) : (
        <a
          ref={setAnchor}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${link.title} (opens in new tab)`}
          aria-describedby={describedBy}
          aria-hidden={selecting || undefined}
          tabIndex={selecting ? -1 : undefined}
          className={OPENER_CLASS}
          onClick={(event) => {
            if (consumeLongPress()) {
              event.preventDefault();
              return;
            }
            if (selecting) {
              event.preventDefault();
              linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
            }
          }}
        />
      )}
      {/* The content is a picture of the link: clicks go to the link. */}
      <div className="pointer-events-none flex flex-col">
        {audio ? (
          // The bar holds the owner's checkbox itself: in the sleeve's
          // corner on hover, in its place while selecting. A press on the
          // rest of it expands it in place into the player.
          <AudioBar
            link={link}
            badge={badge}
            describedBy={describedBy}
            expandRef={demo ? undefined : setAnchor}
            owner={
              demo
                ? undefined
                : {
                    selected,
                    onToggleSelect: clickToSelect,
                    onTapSelect: tapToSelect,
                    consumeLongPress,
                  }
            }
          />
        ) : (
          <LinkCardContent
            link={link}
            eagerThumbnail={eagerThumbnail}
            mediaAnchor={anchoredFace}
            badge={badge}
          />
        )}
      </div>
      {folderTag ? <FolderTagLabel id={folderLabelId} folder={folderTag} /> : null}
      {demo ? null : audio ? (
        // Over the bar's top-right corner, as on every card: on the bar's
        // surface, fading in over 24px, so it covers the words' end (which
        // run to the bar's margin) cleanly. It keeps the corner opened. The
        // backing takes no presses (they open the bar); its buttons do.
        <div
          inert={selecting}
          className={cn(
            "pointer-events-none absolute top-1.5 right-1.5 z-10 flex rounded-e-md bg-card ps-6 [mask-image:linear-gradient(to_right,transparent,black_24px)] *:pointer-events-auto",
            menuReveal,
          )}
          data-card-menu
        >
          {linkFolder ? <FolderLinkButton folder={linkFolder} /> : null}
          {menu}
        </div>
      ) : (
        <>
          <Checkbox
            checked={selected}
            aria-label={`Select ${link.title}`}
            className={cn(
              "absolute top-2 left-2 z-10 cursor-pointer bg-background shadow-sm transition-opacity duration-150 ease-out-strong",
              selecting || selected
                ? "opacity-100"
                : "opacity-0 focus-visible:opacity-100 [@media(hover:hover)]:group-hover/card:opacity-100",
            )}
            onClick={(event) => {
              event.preventDefault();
              if (consumeLongPress()) return;
              linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
            }}
          />
          {/* Touch: the checkbox's tap, with a tick, over its hit area (its
          after: extension included: 40×32 around the 16px box at 8, 8). */}
          <HapticTarget
            className="inset-auto top-0 -left-1 z-[11] h-8 w-10"
            onTap={tapToSelect}
          />
          <div
            inert={selecting}
            className={cn(
              "absolute top-1.5 right-1.5 z-10 flex rounded-md bg-background/80 backdrop-blur-sm",
              menuReveal,
            )}
            data-card-menu
          >
            {linkFolder ? <FolderLinkButton folder={linkFolder} /> : null}
            {menu}
          </div>
        </>
      )}
      {/* While selecting, a tap anywhere on the card toggles it, with a
          tick (touch); also where a long-press's lift lands. Above the
          link, under the checkbox. */}
      {selecting ? (
        <HapticTarget className="z-[5]" onTap={tapToSelect} />
      ) : null}
    </div>
  );
}
