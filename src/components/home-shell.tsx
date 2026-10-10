"use client";

import { LinkGrid, LinkGroup } from "@/components/link-group";
import { useLinkView } from "@/contexts/link-view-context";
import { LinkSelectionBar } from "@/components/link-selection-bar";
import { LinkOmnibox } from "@/components/link-omnibox";
import {
  forgetLinkPreview,
  OmniboxSaveRow,
  OmniboxSearchAllRow,
} from "@/components/omnibox-rows";
import {
  OmniboxAddSection,
  useOmniboxAddResults,
} from "@/components/omnibox-add-section";
import { PasteHandler } from "@/components/paste-handler";
import {
  LinkResultsSkeleton,
  OmniboxAddSkeleton,
} from "@/components/skeletons/home";
import { useLinksSyncActions, useLinksSyncState } from "@/hooks/use-links-sync";
import { useCurrentFolder, useFolders } from "@/hooks/use-folders";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { HOME_LINKS_PAGE_SIZE } from "@/lib/limits";
import {
  clearLeavingLinks,
  leavingFadeRemaining,
  LINKS_MOVED_EVENT,
  markLinksLeaving,
  settleLeavingLinks,
  useLeavingLinks,
  type LinksMovedDetail,
} from "@/lib/leaving-links";
import { coolPreviews } from "@/lib/link-preview-warmth";
import { settleLinkReadOverrides } from "@/lib/link-read-state";
import { linkSelection, setSelectableLinks } from "@/lib/link-selection";
import { isSameLinkUrl, omniboxSaveUrl } from "@/lib/omnibox";
import { captureFlip, playFlip, type FlipSnapshot } from "@/lib/flip";
import { cn } from "@/lib/utils";
import { usePendingLinkDeletes } from "@/lib/pending-link-deletes";
import { requestSaveUrl } from "@/lib/save-link";
import {
  countGroupedLinks,
  groupLinksByDate,
  mergeLinkGroups,
  parseJsonLinkGroups,
  type Link,
  type LinkGroup as LinkGroupType,
} from "@/utils/links";
import {
  readTimeZoneCookie,
  serializeTimeZoneCookie,
  timeZoneToPersist,
} from "@/utils/time-zone";
import { BouncingDots } from "loading-dev";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { LinkGroupEmpty } from "./link-group-empty";

/** Coming back to the app after at least this long away refreshes the list. */
const RETURN_REFRESH_AFTER_MS = 30_000;

/** Wait after the last keystroke before the list follows the search field. */
const SEARCH_DEBOUNCE_MS = 250;
/** A first search slower than this shows a skeleton… */
const SEARCH_SKELETON_DELAY_MS = 300;
/** …for at least this long, so it doesn't blink. */
const SEARCH_SKELETON_MIN_MS = 300;

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

/** Rows whose favicons load eagerly: about two phone screens. */
const EAGER_FAVICONS = 15;

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
  const currentFolder = useCurrentFolder();
  const router = useRouter();
  const searchParams = useSearchParams();
  // The search field. `?q=` (from a folder's "Search all links") seeds it.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  // What the list is filtered by: the field, trimmed and debounced.
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryRef = useRef("");
  // The search `nextCursor` belongs to: a cursor only pages the list it came
  // from, so loadMore never sends an old list's cursor with a new query.
  const cursorQueryRef = useRef("");
  // The search the list on screen answers ("" for the whole list, as the
  // server rendered it). Until it catches up with the field, the list shows
  // a skeleton instead of the previous answer.
  const [loadedQuery, setLoadedQuery] = useState("");
  const [groups, setGroups] = useState(initialGroups);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  // The link just saved, while its row plays the arrival.
  const [arrivingId, setArrivingId] = useState<string | null>(null);
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

  // Fresh server data (first render or navigation back here) already has
  // every read change confirmed before now; other tabs' changes show again.
  useEffect(() => {
    settleLinkReadOverrides(Date.now());
  }, [initialGroups]);

  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  const reloadSeq = useRef(0);

  /**
   * Re-fetches exactly as many links as are loaded, so pages stay consistent
   * after inserts/deletes; `fresh` starts over from the first page (a new
   * search). Follows the current search.
   */
  const reload = useCallback(async ({ fresh = false } = {}) => {
    const seq = ++reloadSeq.current;
    const startedAt = Date.now();
    const limit = fresh
      ? HOME_LINKS_PAGE_SIZE
      : Math.max(countGroupedLinks(groupsRef.current), HOME_LINKS_PAGE_SIZE);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      const query = searchQueryRef.current;
      if (folderId) params.set("folderId", folderId);
      if (query) params.set("q", query);
      const page = await fetchLinksPage(params);
      if (seq !== reloadSeq.current) return;
      // Rows moved out are still fading: let that finish before they go.
      const wait = leavingFadeRemaining();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (seq !== reloadSeq.current) return;
      }
      setGroups(page.groups);
      setNextCursor(page.nextCursor);
      cursorQueryRef.current = query;
      setLoadedQuery(query);
      // The list now says where every row is: rows faded out by a move
      // before this reload began are gone (or back, after Undo).
      settleLeavingLinks(startedAt);
      // Read changes the server had confirmed are in this list too.
      settleLinkReadOverrides(startedAt);
      if (page.timeZone) setGroupsTimeZone(page.timeZone);
      if (typeof page.total === "number") setLinksTotal(page.total);
    } catch {
      // Keep the current list; the next change or reload will retry. It
      // stands as this search's answer, rather than a skeleton that never
      // ends.
      if (seq === reloadSeq.current) setLoadedQuery(searchQueryRef.current);
    }
  }, [setLinksTotal, folderId]);

  // A folder page: links moved out of it fade out (like a delete) before
  // the reload drops them.
  useEffect(() => {
    if (!folderId) return;
    const onMoved = (event: Event) => {
      const { ids, folderId: target } = (event as CustomEvent<LinksMovedDetail>)
        .detail;
      if (target === folderId) return;
      const shown = new Set(
        groupsRef.current.flatMap((group) => group.links.map((link) => link.id)),
      );
      markLinksLeaving(ids.filter((id) => shown.has(id)));
    };
    window.addEventListener(LINKS_MOVED_EVENT, onMoved);
    return () => {
      window.removeEventListener(LINKS_MOVED_EVENT, onMoved);
      // The marks belong to this page's list: another folder (where the
      // links may have moved) must not hide them.
      clearLeavingLinks();
    };
  }, [folderId]);

  // The list follows the search field, a moment after typing stops.
  useEffect(() => {
    const next = query.trim();
    const timer = setTimeout(() => setSearchQuery(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (searchQuery === searchQueryRef.current) return;
    searchQueryRef.current = searchQuery;
    void reload({ fresh: true });
  }, [searchQuery, reload]);

  // `?q=` has done its job once read: drop it so a reload or share of the
  // URL doesn't bring back a stale search.
  useEffect(() => {
    if (!searchParams.has("q")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the field holds a URL: the URL to save, and whether it's already
  // in the list.
  const saveUrl = omniboxSaveUrl(query);
  const alreadySaved =
    saveUrl !== null &&
    groups.some((group) =>
      group.links.some((link) => isSameLinkUrl(link.url, saveUrl)),
    );
  // A folder's search also finds your other links, to add here. A URL in
  // the field is the Save row's (saving it files it here).
  const otherResults = useOmniboxAddResults(folderId, searchQuery);
  const addLinks = useMemo(
    () =>
      saveUrl
        ? otherResults.links.filter((link) => !isSameLinkUrl(link.url, saveUrl))
        : otherResults.links,
    [otherResults.links, saveUrl],
  );

  // A search on its way (typing, its debounce, the list's reload and, in a
  // folder, the Add section's fetch). Meanwhile the page keeps the last
  // whole answer (`settled`: the list and the Add section together, for
  // one search), dimmed, and swaps it all at once: no "Search all" ahead of
  // its results, no "no match" flashing between two searches.
  const typedQuery = query.trim();
  const pending =
    typedQuery !== loadedQuery ||
    Boolean(folderId && typedQuery && otherResults.loading);
  const [settled, setSettled] = useState(() => ({
    query: loadedQuery,
    groups: initialGroups,
    addLinks,
    addHasMore: otherResults.hasMore,
  }));
  if (
    !pending &&
    (settled.query !== loadedQuery ||
      settled.groups !== groups ||
      settled.addLinks !== addLinks ||
      settled.addHasMore !== otherResults.hasMore)
  ) {
    setSettled({
      query: loadedQuery,
      groups,
      addLinks,
      addHasMore: otherResults.hasMore,
    });
  }
  const addResults = useMemo(
    () => ({ ...otherResults, links: settled.addLinks, hasMore: settled.addHasMore }),
    [otherResults, settled.addLinks, settled.addHasMore],
  );

  // The first search from the whole list has nothing relevant to keep on
  // screen: if it takes a moment (300ms), a skeleton stands in for its
  // answer, and once shown stays at least as long, so it never blinks.
  // Refining a search keeps the previous results (dimmed) instead.
  const wantsSkeleton = pending && settled.query === "" && typedQuery !== "";
  const [skeletonShown, setSkeletonShown] = useState(false);
  const skeletonSinceRef = useRef(0);
  useEffect(() => {
    if (wantsSkeleton && !skeletonShown) {
      const timer = setTimeout(() => {
        skeletonSinceRef.current = Date.now();
        setSkeletonShown(true);
      }, SEARCH_SKELETON_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!pending && skeletonShown) {
      const shownFor = Date.now() - skeletonSinceRef.current;
      const timer = setTimeout(
        () => setSkeletonShown(false),
        Math.max(0, SEARCH_SKELETON_MIN_MS - shownFor),
      );
      return () => clearTimeout(timer);
    }
  }, [wantsSkeleton, pending, skeletonShown]);
  // The previous answer, while the next one loads: stepped back after a
  // beat (no flicker when it's quick), back at once when it lands.
  const dimClass = cn(
    "transition-opacity duration-150 ease-out motion-reduce:transition-none",
    pending && !skeletonShown ? "opacity-60 delay-150" : "delay-0",
  );
  // A link added from the Add section joins this folder's results at once,
  // under its day (as the server will list it), gliding there from its row
  // in the section while everything it displaces slides into place (FLIP:
  // positions recorded here, played once that render is on screen). The
  // reload that follows the move confirms it; a failed move takes it out.
  const flipRef = useRef<FlipSnapshot | null>(null);
  const [flipCount, setFlipCount] = useState(0);
  useLayoutEffect(() => {
    const before = flipRef.current;
    flipRef.current = null;
    if (before) playFlip(before);
  }, [flipCount]);
  const onAddingFromSearch = useCallback(
    (link: Link) => {
      flipRef.current = captureFlip();
      setFlipCount((count) => count + 1);
      // A reload already on its way predates this: its list mustn't drop
      // the link again (the move's own reload replaces it).
      reloadSeq.current++;
      setGroups((current) =>
        groupLinksByDate(
          [
            ...current.flatMap((group) =>
              group.links.filter((other) => other.id !== link.id),
            ),
            { ...link, folderId: folderId ?? null },
          ],
          { timeZone: groupsTimeZone },
        ),
      );
      return () => {
        setGroups((current) =>
          current
            .map((group) => ({
              ...group,
              links: group.links.filter((other) => other.id !== link.id),
            }))
            .filter((group) => group.links.length > 0),
        );
        void reload();
      };
    },
    [folderId, groupsTimeZone, reload],
  );
  const saveFromField = useCallback(() => {
    if (!saveUrl) return;
    // Its preview's "saved" is about to be wrong.
    forgetLinkPreview(saveUrl);
    // Back to the whole list first, so the new row shows where it lands.
    setQuery("");
    setSearchQuery("");
    if (!requestSaveUrl(saveUrl)) {
      toast.error("Unable to save the link yet. Try again in a moment.");
    }
  }, [saveUrl]);

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
    // A new search is loading: this cursor is the old list's.
    const query = searchQueryRef.current;
    if (cursorQueryRef.current !== query) return;
    setLoadingMore(true);
    const seq = reloadSeq.current;
    try {
      const params = new URLSearchParams({
        limit: String(HOME_LINKS_PAGE_SIZE),
        cursor: nextCursor,
      });
      if (folderId) params.set("folderId", folderId);
      if (query) params.set("q", query);
      const page = await fetchLinksPage(params);
      // A reload started meanwhile already has fresher data.
      if (seq !== reloadSeq.current || cursorQueryRef.current !== query) return;
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

  const onSaveSuccess = useCallback(async (newLinkId?: string) => {
    // Set before the reload, so the real row mounts already arriving.
    if (newLinkId) setArrivingId(newLinkId);
    await reload();
    setPendingUrl(null);
    // Once the row is in, give the arrival (200ms + the domain's 40ms) time
    // to play, then stop marking it (unless a newer save took over).
    if (newLinkId) {
      setTimeout(
        () => setArrivingId((id) => (id === newLinkId ? null : id)),
        500,
      );
    }
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

  const { view } = useLinkView();
  // What's on screen: the settled answer (see `settled`).
  const shownGroups = settled.groups;
  const todayGroup = shownGroups.find((g) => g.label === "Today");

  // Optimistic row only for a URL this tab is saving.
  const showSkeleton = pendingUrl !== null;
  const skeletonUrl = pendingUrl ?? "";
  const showSyntheticToday = showSkeleton && !todayGroup;
  // Every loaded link deleted (awaiting Undo) and nothing left to load reads
  // as empty, so the empty state shows instead of a blank list.
  const pendingDeletes = usePendingLinkDeletes();
  const leavingLinks = useLeavingLinks();
  const isHidden = (id: string) =>
    pendingDeletes.get(id) === "hidden" ||
    leavingLinks.get(id)?.phase === "hidden";
  // The first screenful of favicons loads right away (not lazily), so the
  // rows people see first don't wait on the scroll observer: each group
  // gets what's left of the budget after the groups above it. Hidden rows
  // (deleted, moved out) don't render, so they don't spend it.
  const eagerFaviconsByGroup = shownGroups.reduce<number[]>((counts, group, index) => {
    const used = counts.reduce((sum, count) => sum + count, 0);
    const visible = group.links.filter((link) => !isHidden(link.id)).length;
    counts[index] = Math.min(visible, EAGER_FAVICONS - used);
    return counts;
  }, []);
  const allLinksHidden =
    !nextCursor &&
    shownGroups.every((group) => group.links.every((link) => isHidden(link.id)));

  // The selectable links are the ones on screen, in display order; a link
  // that leaves the list (moved out of this folder, deleted) leaves the
  // selection too.
  useEffect(() => {
    setSelectableLinks(
      shownGroups.flatMap((group) =>
        group.links
          .filter(
            (link) =>
              pendingDeletes.get(link.id) !== "hidden" &&
              leavingLinks.get(link.id)?.phase !== "hidden",
          )
          .map((link) => link.id),
      ),
    );
  }, [shownGroups, pendingDeletes, leavingLinks]);

  // Each loaded link, for the selection bar: its folder ("Remove from
  // folders") and reading state (Mark read / unread).
  const linkById = useMemo(
    () =>
      new Map(
        groups.flatMap((group) =>
          group.links.map((link) => [link.id, link] as const),
        ),
      ),
    [groups],
  );
  const folderOf = useCallback(
    (linkId: string) => {
      const link = linkById.get(linkId);
      return link ? (link.folderId ?? null) : undefined;
    },
    [linkById],
  );
  const linkOf = useCallback((linkId: string) => linkById.get(linkId), [linkById]);

  // A selection belongs to one list: switching folders or leaving drops it.
  useEffect(() => () => linkSelection.clear(), [folderId]);

  const listShown = !((!shownGroups.length || allLinksHidden) && !showSyntheticToday);
  const shownQuery = settled.query;
  // On a folder page with a search: your other links that match, to add
  // here. Under the folder's matches, a day group's gap below them.
  const addSection =
    folderId && currentFolder && shownQuery ? (
      <OmniboxAddSection
        folder={currentFolder}
        results={addResults}
        onAdding={onAddingFromSearch}
      />
    ) : null;

  return (
    <>
      <PasteHandler
        onPasteStart={onPasteStart}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
      />
      {saveUrl ? (
        // A row, so the list's column in the grid view too.
        <div className="wrapper-private">
          <OmniboxSaveRow
            url={saveUrl}
            alreadySaved={alreadySaved}
            folderName={folderId ? currentFolder?.name : undefined}
            onSave={saveFromField}
          />
        </div>
      ) : null}
      {skeletonShown ? (
        <div aria-busy className="flex w-full flex-col gap-8">
          <span className="sr-only" role="status">
            Searching links
          </span>
          <LinkResultsSkeleton rows={3} cards={4} />
          {folderId && typedQuery ? <OmniboxAddSkeleton /> : null}
        </div>
      ) : !listShown ? (
        // A URL that matches nothing: the Save row above is the answer.
        // In a folder, so are your other links that match (below).
        (shownQuery && saveUrl) ||
        (folderId && shownQuery && addResults.links.length > 0) ? null : (
          <div className={dimClass}>
            <LinkGroupEmpty
              inFolder={Boolean(folderId)}
              query={shownQuery || undefined}
            />
          </div>
        )
      ) : (
        // Leaving the list resets the preview hover delay (see
        // link-preview-warmth); gaps between date groups don't.
        <div
          aria-busy={pending || undefined}
          className={cn("flex flex-col gap-8", dimClass)}
          onMouseLeave={coolPreviews}
        >
          {view === "grid" ? (
            <LinkGrid
              newLinkId={arrivingId}
              groups={[
                ...(showSyntheticToday
                  ? [{ label: "Today", links: [], pendingUrl: skeletonUrl }]
                  : []),
                ...shownGroups.map((group, groupIndex) => ({
                  label: group.label,
                  links: group.links,
                  pendingUrl:
                    group.label === "Today" && showSkeleton ? skeletonUrl : null,
                  eagerFavicons: eagerFaviconsByGroup[groupIndex],
                })),
              ]}
            />
          ) : null}
          {view !== "grid" && showSyntheticToday && (
            <LinkGroup label="Today" links={[]} pendingUrl={skeletonUrl} />
          )}
          {view !== "grid" && shownGroups.map((group, groupIndex) => (
            <LinkGroup
              key={group.label}
              label={group.label}
              links={group.links}
              newLinkId={arrivingId}
              pendingUrl={
                group.label === "Today" && showSkeleton ? skeletonUrl : null
              }
              eagerFavicons={eagerFaviconsByGroup[groupIndex]}
            />
          ))}
          {/* Once every folder match is loaded (until then, it waits
              below the loader). */}
          {nextCursor ? null : addSection}
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
          {nextCursor ? addSection : null}
        </div>
      )}
      {/* No folder matches (the list isn't shown): the section is all there is. */}
      {listShown || skeletonShown ? null : (
        <div className={dimClass}>{addSection}</div>
      )}
      {/* A folder searches only itself; this widens it to every link. It
          comes with its search's results (under the skeleton, the search
          being typed), in the list's column whatever the view. */}
      {folderId && (skeletonShown ? typedQuery : shownQuery) ? (
        <div
          data-flip="search-all"
          className={cn("wrapper-private", !skeletonShown && dimClass)}
        >
          <OmniboxSearchAllRow
            query={skeletonShown ? typedQuery : shownQuery}
            onSearchAll={() =>
              router.push(
                `/home?q=${encodeURIComponent(skeletonShown ? typedQuery : shownQuery)}`,
              )
            }
          />
        </div>
      ) : null}
      {/* Pinned to the bottom, so they come last in the page too: keyboard
          order follows the screen (list, selection bar, search field). */}
      <LinkSelectionBar folderOf={folderOf} linkOf={linkOf} />
      <LinkOmnibox
        value={query}
        onChange={setQuery}
        onSave={saveFromField}
        saveUrl={saveUrl}
        placeholder={
          folderId
            ? `Search ${currentFolder?.name ?? "this folder"} or paste a link`
            : "Search or paste a link"
        }
      />
    </>
  );
}
