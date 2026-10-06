"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { useLongPress } from "@/hooks/use-long-press";
import { useLeavingLinks } from "@/lib/leaving-links";
import { setLinksRead, useIsLinkRead } from "@/lib/link-read-state";
import {
  linkSelection,
  useIsLinkSelected,
  useIsSelectionActive,
} from "@/lib/link-selection";
import { ARRIVE } from "@/lib/motion";
import { deleteLinkKeepingFocus } from "@/lib/delete-link-focus";
import { haptic } from "@/lib/haptics";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import dynamic from "next/dynamic";
import * as React from "react";
import { FolderTag, useFolderTag } from "./folder-tag";
import { HapticTarget } from "./haptic-target";
import { LINK_CARD_FRAME, LinkCardContent } from "./shared-link-card";
import { Checkbox } from "./ui/checkbox";

// Loaded on demand, like the rows' menu.
const LinkMenu = dynamic(
  () => import("./link-menu").then((m) => m.LinkMenu),
  { loading: () => <div className="size-8" aria-hidden /> },
);

/**
 * A link in the owner's grid: the shared folder's card (same frame and
 * content), plus what the owner's rows do. Opening it marks it read; a
 * read card steps back like a read row. A checkbox in the thumbnail's top
 * corner selects it (shown on hover or focus, and on every card while
 * selecting, when a click anywhere toggles the card); a long-press does
 * the same on touch. The row menu (`⋯`) sits in the other corner, on hover
 * or always on touch. Deleted or moved-away cards fade out, and Undo
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
  const selecting = useIsSelectionActive();
  const selected = useIsLinkSelected(link.id);
  const read = useIsLinkRead(link);
  const folderTag = useFolderTag(link);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLAnchorElement>(null);
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

  return (
    <div
      data-cy="link-card"
      data-selected={selected || undefined}
      className={cn(
        LINK_CARD_FRAME,
        // The link (below) is the focus target: its ring is the card's.
        "group/card relative select-none has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring",
        selected && "ring-2 ring-primary [@media(hover:hover)]:hover:ring-primary",
        arriving && ARRIVE,
        (deletePhase === "fading" || leaving) &&
          "pointer-events-none animate-out fade-out-0 zoom-out-95 duration-200 ease-out-strong",
        deletePhase === "restoring" &&
          "animate-in fade-in-0 zoom-in-95 duration-200 ease-out-strong",
      )}
      {...longPress}
      onPointerDown={(event) => {
        // A press on the menu button, or inside a portal (the open menu,
        // whose React events bubble through here), isn't a long-press on
        // the card. Not stopPropagation: Radix's menu needs that event to
        // reach the document, or its next outside tap counts as inside.
        const target = event.target as Element;
        if (
          !event.currentTarget.contains(target) ||
          target.closest("[data-card-menu]")
        ) {
          return;
        }
        longPress.onPointerDown(event);
      }}
    >
      <a
        ref={anchorRef}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${link.title} (${read ? "read, " : ""}opens in new tab)`}
        aria-describedby={dayHeadingId}
        // While selecting, the checkbox is the keyboard and screen reader
        // control; a click anywhere on the card toggles it.
        aria-hidden={selecting || undefined}
        tabIndex={selecting ? -1 : undefined}
        className="absolute inset-0 z-0 rounded-lg outline-none [-webkit-touch-callout:none]"
        onClick={(event) => {
          if (consumeLongPress()) {
            event.preventDefault();
            return;
          }
          if (selecting) {
            event.preventDefault();
            linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
            return;
          }
          if (!read) void setLinksRead([link.id], true);
        }}
        onAuxClick={(event) => {
          // Middle-click opens it in a background tab.
          if (event.button === 1 && !read) void setLinksRead([link.id], true);
        }}
      />
      {/* The content is a picture of the link: clicks go to the link. */}
      <div className="pointer-events-none flex flex-col">
        <LinkCardContent
          link={link}
          eagerThumbnail={eagerThumbnail}
          read={read}
          tag={folderTag ? <FolderTag folder={folderTag} inCard /> : null}
        />
      </div>
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
      {/* Hidden (and inert) while selecting: every action goes through the
          selection bar then. */}
      <div
        inert={selecting}
        className={cn(
          "absolute top-1.5 right-1.5 z-10 rounded-md bg-background/80 backdrop-blur-sm transition-opacity duration-150 ease-out-strong",
          selecting
            ? "invisible opacity-0"
            : menuOpen
              ? "opacity-100"
              : "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:group-has-[:focus-visible]/card:opacity-100",
        )}
        data-card-menu
      >
        <LinkMenu
          link={link}
          onOpenChange={setMenuOpen}
          onDelete={({ byKeyboard }) =>
            // Keyboard users land on the next card, not the page.
            deleteLinkKeepingFocus({
              linkId: link.id,
              anchor: anchorRef.current,
              siblingsSelector: '[data-cy="link-card"] > a[href]',
              byKeyboard,
              onDeleted: notifyLinksChanged,
            })
          }
        />
      </div>
      {/* While selecting, a tap anywhere on the card toggles it, with a
          tick (touch); also where a long-press's lift lands. Above the
          link, under the checkbox. */}
      {selecting ? <HapticTarget className="z-[5]" onTap={tapToSelect} /> : null}
    </div>
  );
}
