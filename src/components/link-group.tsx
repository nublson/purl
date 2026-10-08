"use client";

import { useLeavingLinks } from "@/lib/leaving-links";
import { LINK_GRID_COLUMNS } from "@/lib/link-view";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkCard } from "./link-card";
import { LinkItem } from "./link-item";
import { MasonryItem, useMasonry } from "./masonry";
import { LinkItemSkeleton } from "./skeletons";
import { SharedLinkCardSkeleton } from "./skeletons/shared-folder";
import { ItemGroup } from "./ui/item";

interface LinkGroupProps {
  label: string;
  links: Link[];
  /** The link just saved: its row plays the arrival (see `LinkItem`). */
  newLinkId?: string | null;
  /** A URL being saved here: its placeholder comes first. */
  pendingUrl?: string | null;
  /** How many of the first links load their favicons (or thumbnails) eagerly. */
  eagerFavicons?: number;
}

/**
 * The links still on screen: deleted-but-undoable links are hidden, and so
 * are links moved out of this folder once they've faded out.
 */
function useVisibleLinks(links: Link[]): Link[] {
  const pendingDeletes = usePendingLinkDeletes();
  const leaving = useLeavingLinks();
  return links.filter(
    (link) =>
      pendingDeletes.get(link.id) !== "hidden" &&
      leaving.get(link.id)?.phase !== "hidden",
  );
}

/**
 * One day of links under its heading, as rows (the list view; the grid
 * isn't split by day, see `LinkGrid`).
 */
export const LinkGroup = ({
  label,
  links,
  newLinkId,
  pendingUrl,
  eagerFavicons = 0,
}: LinkGroupProps) => {
  const headingId = `link-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  // A day whose links are all hidden drops its heading too.
  const visibleLinks = useVisibleLinks(links);
  if (visibleLinks.length === 0 && !pendingUrl) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full flex flex-col justify-start items-start gap-4"
    >
      <h2 id={headingId} className="text-xs text-muted-foreground font-medium ms-2">
        {label}
      </h2>
      <ItemGroup aria-labelledby={headingId} className="w-full gap-0">
        {pendingUrl ? <LinkItemSkeleton url={pendingUrl} animateIn /> : null}
        {visibleLinks.map((link, index) => (
          // content-visibility skips layout/paint for off-screen rows; the
          // intrinsic size (one row) keeps the scrollbar stable. Adjacent
          // selected rows join into one shape: square the corners they share.
          <div
            key={link.id}
            role="listitem"
            className="[content-visibility:auto] [contain-intrinsic-size:auto_48px] max-md:[contain-intrinsic-size:auto_56px] [&:has(+div_[data-selected])_[data-selected]]:rounded-b-none [&:has([data-selected])+div_[data-selected]]:rounded-t-none"
          >
            <LinkItem
              link={link}
              eagerFavicon={index < eagerFavicons}
              arriving={link.id === newLinkId}
            />
          </div>
        ))}
      </ItemGroup>
    </section>
  );
};

export type LinkGridGroup = Omit<LinkGroupProps, "newLinkId">;

/**
 * The grid view: every day's cards in one masonry, in order, so a short
 * day doesn't leave its last row half empty before the next day starts.
 * Each day's label rides on its first card (above it, in its cell), so
 * the dates still mark where each day begins.
 */
export function LinkGrid({
  groups,
  newLinkId,
  columns = LINK_GRID_COLUMNS,
}: {
  groups: LinkGridGroup[];
  newLinkId?: string | null;
  /** The grid's column classes (the landing demo stops at three). */
  columns?: string;
}) {
  const { masonry, listRef } = useMasonry(true);
  const pendingDeletes = usePendingLinkDeletes();
  const leaving = useLeavingLinks();
  const isVisible = (link: Link) =>
    pendingDeletes.get(link.id) !== "hidden" &&
    leaving.get(link.id)?.phase !== "hidden";

  const cells = groups.flatMap((group) => {
    const visible = group.links.filter(isVisible);
    const headingId = `link-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const heading = (
      // From md it sits in the 40px gutter above its card (the first row's
      // in the list's top padding), so the label doesn't push its card
      // down and card tops still line up. Phones' 16px gutter is too
      // tight for it: there it's in the cell, above the card.
      <h2
        id={headingId}
        className="mb-2 text-xs leading-4 font-medium text-muted-foreground md:absolute md:bottom-full md:left-0"
      >
        {group.label}
      </h2>
    );
    const groupCells: { key: string; node: ReactNode }[] = [];
    if (group.pendingUrl) {
      groupCells.push({
        key: `pending-${group.label}`,
        node: <SharedLinkCardSkeleton />,
      });
    }
    visible.forEach((link, index) => {
      groupCells.push({
        key: link.id,
        node: (
          <LinkCard
            link={link}
            eagerThumbnail={index < (group.eagerFavicons ?? 0)}
            arriving={link.id === newLinkId}
            dayHeadingId={headingId}
          />
        ),
      });
    });
    return groupCells.map((cell, index) => ({
      ...cell,
      heading: index === 0 ? heading : null,
    }));
  });

  return (
    <ul
      ref={listRef}
      aria-label="Links"
      className={cn(
        "grid w-full",
        masonry ? "auto-rows-[1px]" : "items-start",
        // Room for the first row's labels (16px, 8px above the card).
        "md:pt-6",
        columns,
      )}
    >
      {cells.map((cell) => (
        <MasonryItem
          key={cell.key}
          className={cell.heading ? "relative" : undefined}
        >
          {cell.heading}
          {cell.node}
        </MasonryItem>
      ))}
    </ul>
  );
}
