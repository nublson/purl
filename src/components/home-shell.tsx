"use client";

import { LinkGroup } from "@/components/link-group";
import { PasteHandler } from "@/components/paste-handler";
import { LinkItemSkeleton } from "@/components/skeletons";
import { useLinksSyncActions, useLinksSyncState } from "@/hooks/use-links-sync";
import { useFolders } from "@/hooks/use-folders";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { HOME_LINKS_PAGE_SIZE } from "@/lib/limits";
import { coolPreviews } from "@/lib/link-preview-warmth";
import { linkSelection, setSelectableLinks } from "@/lib/link-selection";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import {
  countGroupedLinks,
  mergeLinkGroups,
  parseJsonLinkGroups,
  type LinkGroup as LinkGroupType,
} from "@/utils/links";
import {
  readTimeZoneCookie,
  serializeTimeZoneCookie,
  timeZoneToPersist,
} from "@/utils/time-zone";
import { BouncingDots } from "loading-dev";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LinkGroupEmpty } from "./link-group-empty";

/** Coming back to the app after at least this long away refreshes the list. */
const RETURN_REFRESH_AFTER_MS = 30_000;

type LinksPageResponse = {
  groups: Parameters<typeof parseJsonLinkGroups>[0];
  nextCursor: string | null;
  total?: number;
  timeZone?: string;
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
  timeZone,
  folderId,
}: {
  userId: string | null;
  initialGroups: LinkGroupType[];
  initialNextCursor: string | null;
  timeZone: string;
  /** Set on a `/folders/[slug]` page to scope every `/api/links` fetch to that folder. Omitted on /home. */
  folderId?: string;
}) {
  useRealtimeSync(userId);
  const { version } = useLinksSyncState();
  const { setLinksTotal } = useLinksSyncActions();
  const { refresh: refreshFolders } = useFolders();
  const [groups, setGroups] = useState(initialGroups);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // The zone the displayed groups were labeled in; pages from another zone
  // must not be merged into them.
  const [groupsTimeZone, setGroupsTimeZone] = useState(timeZone);

  // Re-seed from the server when the route re-renders with new data.
  const [seed, setSeed] = useState(initialGroups);
  if (seed !== initialGroups) {
    setSeed(initialGroups);
    setGroups(initialGroups);
    setNextCursor(initialNextCursor);
    setGroupsTimeZone(timeZone);
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
      const params = new URLSearchParams({ limit: String(limit) });
      if (folderId) params.set("folderId", folderId);
      const page = await fetchLinksPage(params);
      if (seq !== reloadSeq.current) return;
      setGroups(page.groups);
      setNextCursor(page.nextCursor);
      if (page.timeZone) setGroupsTimeZone(page.timeZone);
      if (typeof page.total === "number") setLinksTotal(page.total);
    } catch {
      // Keep the current list; the next change or reload will retry.
    }
  }, [setLinksTotal, folderId]);

  // Coming back after a while (e.g. an installed app resumed on iOS, whose
  // Realtime connection may have dropped while suspended) quietly reloads
  // the list (and with it Home's total) and the folder counts.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= RETURN_REFRESH_AFTER_MS) {
        refreshFolders();
        void reload();
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reload, refreshFolders]);

  // If the browser's time zone differs from the one the server resolved (and
  // from what's already cookied), persist it and reload once so grouping
  // matches the viewer instead of the server's guess. Runs once on mount:
  // `reload` is stable and `timeZoneToPersist` only returns non-null the
  // first time the cookie needs to change, so this can't loop.
  useEffect(() => {
    try {
      const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const zone = timeZoneToPersist({
        browser,
        server: timeZone,
        cookie: readTimeZoneCookie(document.cookie),
      });
      if (zone) {
        document.cookie = serializeTimeZoneCookie(zone);
        // Cookies can be blocked (e.g. private browsing); only reload if the
        // write actually took, otherwise this would reload on every mount.
        if (readTimeZoneCookie(document.cookie) === zone) void reload();
      }
    } catch {
      // Leave the server-grouped list as-is.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const seq = reloadSeq.current;
    try {
      const params = new URLSearchParams({
        limit: String(HOME_LINKS_PAGE_SIZE),
        cursor: nextCursor,
      });
      if (folderId) params.set("folderId", folderId);
      const page = await fetchLinksPage(params);
      // A reload started meanwhile already has fresher data.
      if (seq !== reloadSeq.current) return;
      // The time zone changed under the list (e.g. the cookie correction
      // above): relabel everything instead of mixing headings from two zones.
      if (page.timeZone && page.timeZone !== groupsTimeZone) {
        void reload();
        return;
      }
      setGroups((current) => mergeLinkGroups(current, page.groups));
      setNextCursor(page.nextCursor);
    } catch {
      // Sentinel stays visible; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, groupsTimeZone, reload, folderId]);

  // Reload when a save, edit, delete, or remote update bumps the version
  // (skipping the version this list mounted with).
  const handledVersion = useRef(version);
  useEffect(() => {
    if (version === handledVersion.current) return;
    handledVersion.current = version;
    void reload();
  }, [version, reload]);

  // Leaving /home without a mouse-leave (e.g. keyboard navigation) must not
  // carry the "preview already open" state back to the next visit.
  useEffect(() => coolPreviews, []);

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
    // On a folder page, `saveLink` (via PasteHandler's own
    // `useCurrentFolder()`, which inside the page's CurrentFolderProvider
    // always resolves to this `folderId`) already toasted "Saved to
    // {name}"/"Moved to {name}" — skip the generic toast so it isn't doubled.
    if (!folderId) toast.success("Link saved");
    // A save here files the link into this folder (a re-saved URL moves in
    // from elsewhere), so folder counts change. `reload()` above only
    // refreshes this list, not the folder list behind the header's counts.
    else refreshFolders();
  }, [reload, folderId, refreshFolders]);

  const onSaveError = useCallback(() => {
    setPendingUrl(null);
  }, []);

  const todayGroup = groups.find((g) => g.label === "Today");
  const firstGroupWithLinksIndex = groups.findIndex((g) => g.links.length > 0);

  // Optimistic row only for a URL this tab is saving.
  const showSkeleton = pendingUrl !== null;
  const skeletonUrl = pendingUrl ?? "";
  const showSyntheticToday = showSkeleton && !todayGroup;
  // Every loaded link deleted (awaiting Undo) and nothing left to load reads
  // as empty, so the empty state shows instead of a blank list.
  const pendingDeletes = usePendingLinkDeletes();
  const allLinksHidden =
    !nextCursor &&
    groups.every((group) =>
      group.links.every((link) => pendingDeletes.get(link.id) === "hidden"),
    );

  // The selectable links are the ones on screen, in display order; a link
  // that leaves the list (moved out of this folder, deleted) leaves the
  // selection too.
  useEffect(() => {
    setSelectableLinks(
      groups.flatMap((group) =>
        group.links
          .filter((link) => pendingDeletes.get(link.id) !== "hidden")
          .map((link) => link.id),
      ),
    );
  }, [groups, pendingDeletes]);

  // A selection belongs to one list: switching folders or leaving drops it.
  useEffect(() => () => linkSelection.clear(), [folderId]);

  return (
    <>
      <PasteHandler
        onPasteStart={onPasteStart}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
      />
      {(!groups.length || allLinksHidden) && !showSyntheticToday ? (
        <LinkGroupEmpty />
      ) : (
        // Leaving the list resets the preview hover delay (see
        // link-preview-warmth); gaps between date groups don't.
        <div className="flex flex-col gap-8" onMouseLeave={coolPreviews}>
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
          {/* Always rendered with the list, so the status region is in place
              before "Loading more links" is announced and its height never
              appears or disappears (including when the last page loads). The
              scroll sentinel sits inside it, absolutely positioned, so
              removing it after the last page doesn't shift layout either. */}
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
                {/* The library sizes dots at 22% of `size` (4.4px here), which
                    lands them on fractional pixels and antialiasing smears
                    them into ovals. Pin dot and gap to whole pixels. */}
                <BouncingDots size={20} className="gap-1! *:size-1!" />
                <span className="sr-only">Loading more links</span>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
