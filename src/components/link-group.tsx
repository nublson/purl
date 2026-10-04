"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useLeavingLinks } from "@/lib/leaving-links";
import { LINK_GRID_COLUMNS } from "@/lib/link-view";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { cn } from "@/lib/utils";
import { Link } from "@/utils/links";
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
 * One day of links under its heading, in the owner's view: rows, or the
 * shared folder's grid of cards (same columns and masonry), with the
 * heading lined up with the grid's first column.
 */
export const LinkGroup = ({
  label,
  links,
  newLinkId,
  pendingUrl,
  eagerFavicons = 0,
}: LinkGroupProps) => {
  const { view } = useLinkView();
  const masonry = useMasonry(view === "grid");
  const headingId = `link-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  // Links deleted but still undoable are hidden here, and a day whose links
  // are all hidden drops its heading too.
  const pendingDeletes = usePendingLinkDeletes();
  // Links moved out of this folder fade out, then hide the same way.
  const leaving = useLeavingLinks();
  const visibleLinks = links.filter(
    (link) =>
      pendingDeletes.get(link.id) !== "hidden" &&
      leaving.get(link.id)?.phase !== "hidden",
  );
  if (visibleLinks.length === 0 && !pendingUrl) return null;

  if (view === "grid") {
    return (
      <section
        aria-labelledby={headingId}
        className="flex w-full flex-col items-start justify-start gap-4"
      >
        {/* In the grid's columns, so it starts where the first card does. */}
        <div className={cn("grid w-full", LINK_GRID_COLUMNS)}>
          <h2
            id={headingId}
            className="col-span-full text-xs font-medium text-muted-foreground"
          >
            {label}
          </h2>
        </div>
        <ul
          aria-labelledby={headingId}
          className={cn(
            "grid w-full",
            masonry ? "auto-rows-[1px]" : "items-start",
            LINK_GRID_COLUMNS,
          )}
        >
          {pendingUrl ? (
            <MasonryItem masonry={masonry}>
              <SharedLinkCardSkeleton />
            </MasonryItem>
          ) : null}
          {visibleLinks.map((link, index) => (
            <MasonryItem key={link.id} masonry={masonry}>
              <LinkCard
                link={link}
                eagerThumbnail={index < eagerFavicons}
                arriving={link.id === newLinkId}
              />
            </MasonryItem>
          ))}
        </ul>
      </section>
    );
  }

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
            className="[content-visibility:auto] [contain-intrinsic-size:auto_48px] [&:has(+div_[data-selected])_[data-selected]]:rounded-b-none [&:has([data-selected])+div_[data-selected]]:rounded-t-none"
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
