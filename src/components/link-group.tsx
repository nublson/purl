"use client";

import { useLeavingLinks } from "@/lib/leaving-links";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkItem } from "./link-item";
import { ItemGroup } from "./ui/item";

interface LinkGroupProps {
  label: string;
  links: Link[];
  /** The link just saved: its row plays the arrival (see `LinkItem`). */
  newLinkId?: string | null;
  prependItems?: ReactNode;
  /** How many of the first rows load their favicons eagerly. */
  eagerFavicons?: number;
}

export const LinkGroup = ({
  label,
  links,
  newLinkId,
  prependItems,
  eagerFavicons = 0,
}: LinkGroupProps) => {
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
  if (visibleLinks.length === 0 && !prependItems) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full flex flex-col justify-start items-start gap-4"
    >
      <h2 id={headingId} className="text-xs text-muted-foreground font-medium ms-2">
        {label}
      </h2>
      <ItemGroup aria-labelledby={headingId} className="w-full gap-0">
        {prependItems}
        {visibleLinks.map((link, index) => (
          // content-visibility skips layout/paint for off-screen rows; the
          // intrinsic size (one row) keeps the scrollbar stable. Adjacent
          // selected rows join into one shape: square the corners they share.
          <div
            key={link.id}
            role="listitem"
            className="[content-visibility:auto] [contain-intrinsic-size:auto_48px] [&:has(+div>[data-selected])>[data-selected]]:rounded-b-none [&:has(>[data-selected])+div>[data-selected]]:rounded-t-none"
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
