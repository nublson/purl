"use client";

import { coolPreviews } from "@/lib/link-preview-warmth";
import type { PublicLink } from "@/lib/public-folders";
import type { Link } from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { BouncingDots } from "loading-dev";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SharedLinkCard } from "./shared-link-card";
import { useSharedFolderView } from "./shared-folder-view";
import { SharedLinkItem } from "./shared-link-item";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { ItemGroup } from "./ui/item";

function toLink(link: PublicLink): Link {
  return { ...link, createdAt: new Date(link.createdAt), folderId: null };
}

/**
 * A shared folder's links, newest first: the owner's rows in one list (no
 * day headings), or preview cards in a grid, per the header's view toggle. Older pages load as you scroll, from the public
 * endpoint (`apiPath`).
 */
export function SharedFolderList({
  initialLinks,
  initialNextCursor,
  apiPath,
}: {
  initialLinks: PublicLink[];
  initialNextCursor: string | null;
  apiPath: string;
}) {
  const [links, setLinks] = useState(() => initialLinks.map(toLink));
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const view = useSharedFolderView();

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `${apiPath}?cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!response.ok) return;
      const page = (await response.json()) as {
        links: PublicLink[];
        nextCursor: string | null;
      };
      setLinks((current) => {
        const seen = new Set(current.map((link) => link.id));
        return [
          ...current,
          ...page.links.filter((link) => !seen.has(link.id)).map(toLink),
        ];
      });
      setNextCursor(page.nextCursor);
    } catch {
      // Sentinel stays visible; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [apiPath, nextCursor, loadingMore]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  useEffect(() => coolPreviews, []);

  // Grid: room for four 210px cards and their 16px gaps (4×210 + 3×16).
  const frame = cn(
    "flex flex-1 flex-col gap-8 pt-24 pb-12",
    view === "grid" ? "mx-auto w-full max-w-[888px]" : "wrapper-private",
  );

  if (links.length === 0) {
    return (
      <div className={frame}>
      <Empty data-cy="link-group-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpen />
          </EmptyMedia>
          <EmptyTitle>No links yet</EmptyTitle>
          <EmptyDescription>
            Links added to this folder will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      </div>
    );
  }

  return (
    <div className={frame} onMouseLeave={coolPreviews}>
      {view === "grid" ? (
        <ul
          aria-label="Links"
          // Fixed 210px cards: as many columns as fit, up to four (the
          // frame's width), centered.
          className="grid grid-cols-[repeat(auto-fill,210px)] justify-center gap-4"
        >
          {links.map((link, index) => (
            <li key={link.id}>
              <SharedLinkCard link={link} eagerThumbnail={index < 4} />
            </li>
          ))}
        </ul>
      ) : (
        <ItemGroup aria-label="Links" className="w-full gap-0">
          {links.map((link, index) => (
            <div
              key={link.id}
              role="listitem"
              className="[content-visibility:auto] [contain-intrinsic-size:auto_48px]"
            >
              <SharedLinkItem link={link} eagerFavicon={index === 0} />
            </div>
          ))}
        </ItemGroup>
      )}
      <div
        role="status"
        className="relative flex h-10 w-full items-center justify-center text-muted-foreground"
      >
        {nextCursor && (
          <div
            ref={sentinelRef}
            aria-hidden
            className="absolute inset-x-0 top-0 h-px"
          />
        )}
        {loadingMore ? (
          <>
            <BouncingDots size={20} className="gap-1! *:size-1!" />
            <span className="sr-only">Loading more links</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
