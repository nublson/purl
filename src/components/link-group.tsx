"use client";

import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkItem } from "./link-item";
import { ItemGroup } from "./ui/item";

interface LinkGroupProps {
  label: string;
  links: Link[];
  newLinkId?: string | null;
  prependItems?: ReactNode;
  eagerFirstLinkFavicon?: boolean;
}

export const LinkGroup = ({
  label,
  links,
  prependItems,
  eagerFirstLinkFavicon = false,
}: LinkGroupProps) => {
  const headingId = `link-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  // Links deleted but still undoable are hidden here, and a day whose links
  // are all hidden drops its heading too.
  const pendingDeletes = usePendingLinkDeletes();
  const visibleLinks = links.filter((link) => !pendingDeletes.has(link.id));
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
          // intrinsic size (one row) keeps the scrollbar stable.
          <div
            key={link.id}
            role="listitem"
            className="[content-visibility:auto] [contain-intrinsic-size:auto_50px]"
          >
            <LinkItem
              link={link}
              eagerFavicon={eagerFirstLinkFavicon && index === 0}
            />
          </div>
        ))}
      </ItemGroup>
    </section>
  );
};
