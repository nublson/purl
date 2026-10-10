"use client";

import { useFolderActions, useFolders } from "@/hooks/use-folders";
import { useLinksSyncState } from "@/hooks/use-links-sync";
import type { FolderSummary } from "@/lib/folders";
import { afterTap, haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { formatDomain } from "@/utils/formatter";
import { parseJsonLinks, type Link } from "@/utils/links";
import { ChevronDown, FolderMove } from "reicon-react";
import * as React from "react";
import { FolderEmoji } from "./folder-emoji";
import { FolderTag } from "./folder-tag";
import { HapticTarget } from "./haptic-target";
import { LinkIcon } from "./link-icon";
import { Typography } from "./typography";
import { buttonVariants } from "./ui/button";

/** Links the section shows at first, and how many more each "Show more" adds. */
export const OMNIBOX_ADD_PAGE = 5;

export type OmniboxAddResults = {
  /** Still fetching the first results for this search. */
  loading: boolean;
  /** Matching links outside the folder, newest first (minus ones just added). */
  links: Link[];
  hasMore: boolean;
  showMore: () => void;
  /** Hides `id` at once (it's being added); `undo` brings it back if that fails. */
  hide: (id: string) => { settle: () => void; undo: () => void };
  /**
   * Shows `link` again at `index` at once (its add was undone), until a
   * fetch started after `settle` (the revert saved) lists it where it is.
   */
  restore: (link: Link, index: number) => { settle: () => void };
};

type Restored = { key: string; link: Link; index: number; after: number | null };

type Fetched = {
  key: string;
  links: Link[];
  hasMore: boolean;
  /** Which fetch this was (see `hidden`). */
  seq: number;
};

/**
 * On a folder page with a search: your other links that match it (`GET
 * /api/links/search?notInFolderId=`, title/domain/URL), for the "Add to
 * folder" section under the folder's own results. Refetches when links
 * change anywhere (a link added here leaves the list; Undo brings it back).
 */
export function useOmniboxAddResults(
  folderId: string | undefined,
  query: string,
): OmniboxAddResults {
  const { version } = useLinksSyncState();
  const key = folderId && query ? `${folderId}\n${query}` : "";
  // How many to show; back to one page for each new search.
  const [limit, setLimit] = React.useState({ key, count: OMNIBOX_ADD_PAGE });
  const count = limit.key === key ? limit.count : OMNIBOX_ADD_PAGE;
  const [fetched, setFetched] = React.useState<Fetched | null>(null);
  const seqRef = React.useRef(0);
  // Links being added, by id: hidden until a fetch started after the move
  // was saved (`after`) shows where they are now. Null while it's saving.
  const [hidden, setHidden] = React.useState<ReadonlyMap<string, number | null>>(
    () => new Map(),
  );
  // Links put back by Undo, by id, the same way round.
  const [restored, setRestored] = React.useState<ReadonlyMap<string, Restored>>(
    () => new Map(),
  );

  React.useEffect(() => {
    if (!folderId || !query) return;
    const seq = ++seqRef.current;
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: query,
      notInFolderId: folderId,
      limit: String(count),
    });
    fetch(`/api/links/search?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          links: Parameters<typeof parseJsonLinks>[0];
          hasMore: boolean;
        };
        setFetched({
          key: `${folderId}\n${query}`,
          links: parseJsonLinks(body.links),
          hasMore: body.hasMore,
          seq,
        });
        setHidden((current) => {
          const settled = [...current].filter(
            ([, after]) => after !== null && seq > after,
          );
          if (settled.length === 0) return current;
          const next = new Map(current);
          for (const [id] of settled) next.delete(id);
          return next;
        });
        setRestored((current) => {
          const settled = [...current].filter(
            ([, entry]) => entry.after !== null && seq > entry.after,
          );
          if (settled.length === 0) return current;
          const next = new Map(current);
          for (const [id] of settled) next.delete(id);
          return next;
        });
      })
      .catch(() => {
        // An error reads as no results: the empty state stays the answer.
        if (controller.signal.aborted) return;
        setFetched({ key: `${folderId}\n${query}`, links: [], hasMore: false, seq });
      });
    return () => controller.abort();
  }, [folderId, query, count, version]);

  const current = fetched?.key === key ? fetched : null;
  const links = React.useMemo(() => {
    const shown = (current?.links ?? []).filter((link) => !hidden.has(link.id));
    for (const entry of restored.values()) {
      if (entry.key !== key || shown.some((link) => link.id === entry.link.id)) {
        continue;
      }
      shown.splice(Math.min(entry.index, shown.length), 0, entry.link);
    }
    return shown;
  }, [current, hidden, restored, key]);

  const showMore = React.useCallback(() => {
    setLimit({ key, count: count + OMNIBOX_ADD_PAGE });
  }, [key, count]);

  const hide = React.useCallback((id: string) => {
    setHidden((map) => new Map(map).set(id, null));
    return {
      // Saved: the next fetch that starts from here on knows.
      settle: () =>
        setHidden((map) =>
          map.has(id) ? new Map(map).set(id, seqRef.current) : map,
        ),
      undo: () =>
        setHidden((map) => {
          const next = new Map(map);
          next.delete(id);
          return next;
        }),
    };
  }, []);

  const restore = React.useCallback(
    (link: Link, index: number) => {
      setHidden((map) => {
        if (!map.has(link.id)) return map;
        const next = new Map(map);
        next.delete(link.id);
        return next;
      });
      setRestored((map) =>
        new Map(map).set(link.id, { key, link, index, after: null }),
      );
      return {
        settle: () =>
          setRestored((map) => {
            const entry = map.get(link.id);
            if (!entry) return map;
            return new Map(map).set(link.id, { ...entry, after: seqRef.current });
          }),
      };
    },
    [key],
  );

  return {
    loading: Boolean(key) && !current,
    links,
    hasMore: current?.hasMore ?? false,
    showMore,
    hide,
    restore,
  };
}

/** The rows' shape: the Save row's 48px height, 20px media column and 16px gap. */
const ROW =
  "group/add relative grid h-12 w-full cursor-pointer grid-cols-[20px_1fr_auto] items-center gap-4 rounded-md p-2 text-start outline-none transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring";

/**
 * "Add to 🛠 Dev Tools": on a folder page, the search's matches among your
 * other links, under the folder's own. Each row moves its link into the
 * folder (it's one link, wherever it's filed: a link in another folder
 * leaves that one, so its folder shows as a tag). Up to five, then "Show
 * more". One toast with Undo per add, as the selection bar's Move.
 */
export function OmniboxAddSection({
  folder,
  results,
  onAdding,
}: {
  folder: FolderSummary;
  results: OmniboxAddResults;
  /**
   * The link is on its way into the folder: shown in its results at once,
   * in the same frame its row leaves this section (no moment where it's
   * nowhere, or the empty state stands in). Returns how to take it back
   * out (Undo, or a failed move; `reload` when nothing else will).
   */
  onAdding: (link: Link) => (opts: { reload: boolean }) => void;
}) {
  const { folders } = useFolders();
  const { moveLinks } = useFolderActions();
  const listRef = React.useRef<HTMLDivElement>(null);
  // A row added from the keyboard leaves: focus goes to the row taking its
  // place (or the last one), not back to the page.
  const refocusRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    const index = refocusRef.current;
    if (index === null) return;
    refocusRef.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      "button[data-add-row]",
    );
    if (buttons?.length) buttons[Math.min(index, buttons.length - 1)]?.focus();
  }, [results.links]);

  if (results.links.length === 0) return null;

  const add = async (link: Link, index: number, fromKeyboard: boolean) => {
    if (fromKeyboard) refocusRef.current = index;
    // One update: the row leaves here and arrives in the folder's results.
    const { settle, undo } = results.hide(link.id);
    const takeBack = onAdding(link);
    const result = await moveLinks([link.id], folder.id, {
      target: folder,
      // Undo, the same way back: in one update the link leaves the
      // folder's results and its row returns here, where it was.
      onUndo: () => {
        takeBack({ reload: false });
        return results.restore(link, index).settle;
      },
    });
    if (!result.ok) {
      undo();
      takeBack({ reload: true });
      return;
    }
    settle();
  };

  const headingId = `omnibox-add-${folder.id}`;
  return (
    <section
      data-cy="omnibox-add-section"
      aria-labelledby={headingId}
      // A list in the list's column, in the grid view too.
      className="wrapper-private flex flex-col items-start gap-4"
    >
      <h2
        id={headingId}
        data-flip="add-heading"
        className="ms-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        Add to
        <FolderEmoji emoji={folder.emoji} className="size-auto text-xs" />
        {folder.name}
      </h2>
      <div ref={listRef} role="list" aria-labelledby={headingId} className="w-full">
        {results.links.map((link, index) => {
          const source = link.folderId
            ? (folders.find((f) => f.id === link.folderId) ?? null)
            : null;
          const title = link.title || formatDomain(link.domain);
          return (
            // Same key as its row in the folder's results: added, it glides
            // there (see onAdding).
            <div key={link.id} role="listitem" data-flip={`link:${link.id}`}>
              <button
                type="button"
                data-add-row=""
                data-cy="omnibox-add-row"
                aria-label={
                  source
                    ? `Add ${title} to ${folder.name} (moves it from ${source.name})`
                    : `Add ${title} to ${folder.name}`
                }
                className={ROW}
                onClick={(event) => {
                  haptic("success");
                  // Enter or Space: a click with no pointer presses.
                  const fromKeyboard = event.detail === 0;
                  // The row leaves: after the tap, so iOS still ticks.
                  afterTap(() => void add(link, index, fromKeyboard));
                }}
              >
                <Typography
                  component="span"
                  aria-hidden
                  className="relative flex size-5 items-center justify-center overflow-hidden rounded"
                >
                  <LinkIcon link={link} size="default" />
                </Typography>
                <Typography component="span" className="flex min-w-0 items-baseline gap-2">
                  <Typography
                    component="span"
                    size="small"
                    className="min-w-0 truncate font-medium text-accent-foreground"
                  >
                    {title}
                  </Typography>
                  <Typography component="span" size="small" className="hidden shrink-0 md:block">
                    {formatDomain(link.domain)}
                  </Typography>
                  {source ? <FolderTag folder={source} inButton /> : null}
                </Typography>
                {/* The row menu's "Move to folder" icon, in the 32px slot a
                    saved row's ⋯ takes (as the Save row's +). */}
                <Typography
                  component="span"
                  aria-hidden
                  className="flex size-8 items-center justify-center"
                >
                  <Typography
                    component="span"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "icon-xs" }),
                      "pointer-events-none ease-out-strong group-active/add:scale-[0.96]",
                    )}
                  >
                    <FolderMove />
                  </Typography>
                </Typography>
                <HapticTarget />
              </button>
            </div>
          );
        })}
        {results.hasMore ? (
          <div role="listitem" data-flip="add-more">
            <button
              type="button"
              data-cy="omnibox-add-more"
              className={ROW}
              onClick={results.showMore}
            >
              <Typography
                component="span"
                aria-hidden
                className="flex size-5 items-center justify-center text-muted-foreground"
              >
                <ChevronDown className="size-4" />
              </Typography>
              <Typography component="span" size="small" className="min-w-0 truncate">
                Show more
              </Typography>
              <Typography component="span" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
