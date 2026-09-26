"use client";

import { LinkGroup } from "@/components/link-group";
import { LinkInput } from "@/components/link-input";
import { PasteHandler } from "@/components/paste-handler";
import { LinkItemSkeleton } from "@/components/skeletons";
import { useLinksSyncActions, useLinksSyncState } from "@/hooks/use-links-sync";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { HOME_LINKS_PAGE_SIZE } from "@/lib/limits";
import {
  countGroupedLinks,
  mergeLinkGroups,
  parseJsonLinkGroups,
  type LinkGroup as LinkGroupType,
} from "@/utils/links";
import { BouncingDots } from "loading-dev";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LinkGroupEmpty } from "./link-group-empty";

type LinksPageResponse = {
  groups: Parameters<typeof parseJsonLinkGroups>[0];
  nextCursor: string | null;
  total?: number;
};

async function fetchLinksPage(params: URLSearchParams) {
  const res = await fetch(`/api/links?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load links (${res.status})`);
  const data = (await res.json()) as LinksPageResponse;
  return { ...data, groups: parseJsonLinkGroups(data.groups) };
}

export function HomeShell({
  userId,
  initialGroups,
  initialNextCursor,
}: {
  userId: string | null;
  initialGroups: LinkGroupType[];
  initialNextCursor: string | null;
}) {
  useRealtimeSync(userId);
  const { version } = useLinksSyncState();
  const { setLinksTotal } = useLinksSyncActions();
  const [groups, setGroups] = useState(initialGroups);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Re-seed from the server when the route re-renders with new data.
  const [seed, setSeed] = useState(initialGroups);
  if (seed !== initialGroups) {
    setSeed(initialGroups);
    setGroups(initialGroups);
    setNextCursor(initialNextCursor);
  }

  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  const reloadSeq = useRef(0);

  /** Re-fetches exactly as many links as are loaded, so pages stay consistent after inserts/deletes. */
  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;
    const limit = Math.max(
      countGroupedLinks(groupsRef.current),
      HOME_LINKS_PAGE_SIZE,
    );
    try {
      const page = await fetchLinksPage(
        new URLSearchParams({ limit: String(limit) }),
      );
      if (seq !== reloadSeq.current) return;
      setGroups(page.groups);
      setNextCursor(page.nextCursor);
      if (typeof page.total === "number") setLinksTotal(page.total);
    } catch {
      // Keep the current list; the next change or reload will retry.
    }
  }, [setLinksTotal]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const seq = reloadSeq.current;
    try {
      const page = await fetchLinksPage(
        new URLSearchParams({
          limit: String(HOME_LINKS_PAGE_SIZE),
          cursor: nextCursor,
        }),
      );
      // A reload started meanwhile already has fresher data.
      if (seq !== reloadSeq.current) return;
      setGroups((current) => mergeLinkGroups(current, page.groups));
      setNextCursor(page.nextCursor);
    } catch {
      // Sentinel stays visible; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // Reload when a save, edit, delete, or remote update bumps the version
  // (skipping the version this list mounted with).
  const handledVersion = useRef(version);
  useEffect(() => {
    if (version === handledVersion.current) return;
    handledVersion.current = version;
    void reload();
  }, [version, reload]);

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

  const onPasteStart = useCallback((url: string) => {
    setPendingUrl(url);
  }, []);

  const onSaveSuccess = useCallback(async () => {
    await reload();
    setPendingUrl(null);
    // The new row is only visual; announce the save for screen readers too.
    toast.success("Link saved");
  }, [reload]);

  const onSaveError = useCallback(() => {
    setPendingUrl(null);
  }, []);

  const todayGroup = groups.find((g) => g.label === "Today");
  const firstGroupWithLinksIndex = groups.findIndex((g) => g.links.length > 0);

  // Optimistic row only for a URL this tab is saving.
  const showSkeleton = pendingUrl !== null;
  const skeletonUrl = pendingUrl ?? "";
  const showSyntheticToday = showSkeleton && !todayGroup;

  return (
    <>
      <LinkInput
        onSaveStart={onPasteStart}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
      />
      <PasteHandler
        onPasteStart={onPasteStart}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
      />
      {!groups.length && !showSyntheticToday ? (
        <LinkGroupEmpty />
      ) : (
        <>
          {showSyntheticToday && (
            <LinkGroup
              label="Today"
              links={[]}
              prependItems={<LinkItemSkeleton url={skeletonUrl} animateIn />}
            />
          )}
          {groups.map((group, groupIndex) => (
            <LinkGroup
              key={group.label}
              label={group.label}
              links={group.links}
              prependItems={
                group.label === "Today" && showSkeleton ? (
                  <LinkItemSkeleton url={skeletonUrl} animateIn />
                ) : undefined
              }
              eagerFirstLinkFavicon={
                firstGroupWithLinksIndex >= 0 &&
                groupIndex === firstGroupWithLinksIndex
              }
            />
          ))}
          {nextCursor && (
            <>
              <div ref={sentinelRef} aria-hidden className="h-px w-full" />
              {/* Rendered whenever more pages exist, so the status region is
                  in place before "Loading more links" is announced. Height is
                  reserved to keep the list from jumping. */}
              <div
                role="status"
                className="flex h-10 w-full items-center justify-center text-muted-foreground"
              >
                {loadingMore ? (
                  <>
                    <BouncingDots size={20} />
                    <span className="sr-only">Loading more links</span>
                  </>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
