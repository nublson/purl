"use client";

import { coolPreviews } from "@/lib/link-preview-warmth";
import type { PublicLink } from "@/lib/public-folders";
import { groupLinksByDate, type Link } from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { BouncingDots } from "loading-dev";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * A shared folder's links, laid out like the owner's list (`HomeShell` +
 * `LinkGroup`): grouped by day, older pages load as you scroll, from the
 * public endpoint (`apiPath`).
 */
export function SharedFolderList({
  initialLinks,
  initialNextCursor,
  timeZone,
  apiPath,
}: {
  initialLinks: PublicLink[];
  initialNextCursor: string | null;
  timeZone: string;
  apiPath: string;
}) {
  const [links, setLinks] = useState(() => initialLinks.map(toLink));
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const groups = useMemo(
    () => groupLinksByDate(links, { timeZone }),
    [links, timeZone],
  );

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

  if (groups.length === 0) {
    return (
      <Empty data-cy="link-group-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpen />
          </EmptyMedia>
          <EmptyTitle>No links yet</EmptyTitle>
          <EmptyDescription>
            Nothing has been added to this folder yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-8" onMouseLeave={coolPreviews}>
      {groups.map((group, groupIndex) => {
        const headingId = `link-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <section
            key={group.label}
            aria-labelledby={headingId}
            className="flex w-full flex-col items-start justify-start gap-4"
          >
            <h2
              id={headingId}
              className="ms-2 text-xs font-medium text-muted-foreground"
            >
              {group.label}
            </h2>
            <ItemGroup aria-labelledby={headingId} className="w-full gap-0">
              {group.links.map((link, index) => (
                <div
                  key={link.id}
                  role="listitem"
                  className="[content-visibility:auto] [contain-intrinsic-size:auto_48px]"
                >
                  <SharedLinkItem
                    link={link}
                    eagerFavicon={groupIndex === 0 && index === 0}
                  />
                </div>
              ))}
            </ItemGroup>
          </section>
        );
      })}
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
