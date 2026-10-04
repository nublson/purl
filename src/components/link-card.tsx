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
import {
  deleteLinkWithUndo,
  usePendingLinkDeletes,
} from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import dynamic from "next/dynamic";
import * as React from "react";
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
}: {
  link: LinkType;
  eagerThumbnail?: boolean;
  /** Just saved: it arrives (fades in as a blur clears). */
  arriving?: boolean;
}) {
  const { notifyLinksChanged } = useLinksSyncActions();
  const deletePhase = usePendingLinkDeletes().get(link.id);
  const leaving = useLeavingLinks().get(link.id)?.phase === "fading";
  const selecting = useIsSelectionActive();
  const selected = useIsLinkSelected(link.id);
  const read = useIsLinkRead(link);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { handlers: longPress, consumeLongPress } = useLongPress(() =>
    linkSelection.toggle(link.id),
  );

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
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${link.title} (${read ? "read, " : ""}opens in new tab)`}
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
        onPointerDown={(event) => event.stopPropagation()}
      >
        <LinkMenu
          link={link}
          onOpenChange={setMenuOpen}
          onDelete={() =>
            deleteLinkWithUndo(link.id, { onDeleted: notifyLinksChanged })
          }
        />
      </div>
    </div>
  );
}
