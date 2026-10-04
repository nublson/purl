"use client";

import { coolPreviews } from "@/lib/link-preview-warmth";
import type { PublicLink } from "@/lib/public-folders";
import type { Link } from "@/utils/links";
import { PackageOpen } from "lucide-react";
import { BouncingDots } from "loading-dev";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ARRIVE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  SHARED_GRID_COLUMNS,
  SharedLinkCardSkeleton,
} from "./skeletons/shared-folder";
import { SharedLinkCard } from "./shared-link-card";

/** Placeholder cards while the next page loads: one row at four columns. */
const LOAD_MORE_CARDS = 4;
/** Cards staggered on first load (40ms apart); later ones start with the last. */
const STAGGERED_CARDS = 8;
/** Long enough for the last staggered card's 200ms arrival to finish. */
const ARRIVAL_WINDOW_MS = 600;
/**
 * A card arriving: `ARRIVE` after its own delay (`--arrive-delay`), hidden
 * until it starts. Reduced motion: no stagger (ARRIVE is already fade only).
 */
const CARD_ARRIVE = cn(
  ARRIVE,
  "fill-mode-backwards [animation-delay:var(--arrive-delay)] motion-reduce:[animation-delay:0ms]",
);
import { useSharedFolderView } from "./shared-folder-view";
import { SharedLinkItem } from "./shared-link-item";
import { Typography } from "./typography";
import { Button } from "./ui/button";
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
  description,
}: {
  initialLinks: PublicLink[];
  initialNextCursor: string | null;
  apiPath: string;
  /** The folder's description: one line above the links, when set. */
  description: string | null;
}) {
  const [links, setLinks] = useState(() => initialLinks.map(toLink));
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const { view, switched } = useSharedFolderView();
  // Motion (find-animation-opportunities): links that are new to the page
  // arrive (ARRIVE: fade in as a 4px blur clears, 200ms); links that only
  // remount because the view changed don't. `intro` covers the first load
  // (the swap from the skeleton), `arrivingIds` each loaded-more page.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIntro(false), ARRIVAL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, []);
  const [arrivingIds, setArrivingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (arrivingIds.size === 0) return;
    const timer = setTimeout(() => setArrivingIds(new Set()), ARRIVAL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [arrivingIds]);
  // Masonry needs measured cards, which only exist in the browser: the
  // server's HTML (and the first paint before hydration) shows the cards in
  // plain rows, and the grid switches to masonry before the next paint.
  const [masonry, setMasonry] = useState(false);
  useLayoutEffect(() => {
    if (view === "grid") setMasonry(true);
  }, [view]);

  // A failed page stops loading by scroll: retrying on its own would
  // re-request while the sentinel stays in view (and spend the visitor's
  // rate limit on a 429). 404: the folder is gone or private now, so there's
  // nothing more to load. Anything else offers "Try again".
  const [loadFailed, setLoadFailed] = useState(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadFailed(false);
    try {
      const response = await fetch(
        `${apiPath}?cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (response.status === 404) {
        setNextCursor(null);
        return;
      }
      if (!response.ok) {
        setLoadFailed(true);
        return;
      }
      const page = (await response.json()) as {
        links: PublicLink[];
        nextCursor: string | null;
      };
      setArrivingIds(new Set(page.links.map((link) => link.id)));
      setLinks((current) => {
        const seen = new Set(current.map((link) => link.id));
        return [
          ...current,
          ...page.links.filter((link) => !seen.has(link.id)).map(toLink),
        ];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [apiPath, nextCursor, loadingMore]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || loadFailed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadMore, loadFailed]);

  useEffect(() => coolPreviews, []);

  // Grid: room for four 210px cards and their 40px gaps (4×210 + 3×40).
  const frame = cn(
    // pb-28: the last links scroll clear of the fixed footer.
    "flex flex-1 flex-col pt-24 pb-28",
    view === "grid" ? "mx-auto w-full max-w-[960px]" : "wrapper-private",
  );

  // Lined up with what's below it: the rows' text inset (8px) in the list,
  // the grid's first column in the grid (same columns, spanning them all).
  const descriptionLine = description ? (
    view === "grid" ? (
      <div className={cn("mb-6 grid w-full", SHARED_GRID_COLUMNS)}>
        <Typography component="p" size="small" className="col-span-full">
          {description}
        </Typography>
      </div>
    ) : (
      <Typography component="p" size="small" className="mb-6 px-2">
        {description}
      </Typography>
    )
  ) : null;

  if (links.length === 0) {
    return (
      <div className={frame}>
        {descriptionLine}
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
      {descriptionLine}
      {/* Keyed by view: switching remounts it, and after a switch (not on
          page load) the new layout fades in, opacity only, 150ms. */}
      <div
        key={view}
        className={cn(
          "w-full",
          switched && "animate-in fade-in-0 duration-150 ease-out-strong",
        )}
      >
        {view === "grid" ? (
          <ul
            aria-label="Links"
            // Masonry: 2 columns on phones, 3 on tablets, 4 on desktop; cards
            // up to 210px, centered, gutters 16 → 40px. 1px rows with no row
            // gap: each card spans its own height (see MasonryItem), so a
            // short card sits right under the one above it. DOM order stays
            // newest first, left to right, for keyboard and screen readers.
            className={cn(
              "grid w-full",
              masonry ? "auto-rows-[1px]" : "items-start",
              SHARED_GRID_COLUMNS,
            )}
          >
            {links.map((link, index) => {
              // First load: the first cards arrive 40ms apart (the rest
              // with the last of them); a loaded-more page arrives at once.
              const arriving = intro || arrivingIds.has(link.id);
              const delay = intro ? Math.min(index, STAGGERED_CARDS - 1) * 40 : 0;
              return (
                <MasonryItem
                  key={link.id}
                  masonry={masonry}
                  className={
                    arriving
                      ? CARD_ARRIVE
                      : undefined
                  }
                  style={
                    arriving
                      ? ({ "--arrive-delay": `${delay}ms` } as CSSProperties)
                      : undefined
                  }
                >
                  <SharedLinkCard link={link} eagerThumbnail={index < 4} />
                </MasonryItem>
              );
            })}
            {/* The next page on its way: a row of placeholder cards where
                the new cards will land. */}
            {loadingMore
              ? Array.from({ length: LOAD_MORE_CARDS }, (_, index) => (
                  <MasonryItem key={`loading-${index}`} masonry={masonry}>
                    <SharedLinkCardSkeleton />
                  </MasonryItem>
                ))
              : null}
          </ul>
        ) : (
          <ItemGroup
            aria-label="Links"
            // First load: the rows arrive together (no stagger in a list).
            className={cn("w-full gap-0", intro && ARRIVE)}
          >
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
      </div>
      {/* Load more: the scroll sentinel and the loading announcement,
          always rendered so the status region exists before it speaks.
          The list shows dots in a 40px strip (like the owner's list);
          the grid shows placeholder cards instead, so its strip has no
          height. */}
      <div
        role="status"
        className={cn(
          "relative flex w-full items-center justify-center text-muted-foreground",
          view === "grid" && !loadFailed ? "h-0" : "mt-8 h-10",
        )}
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
            {view === "list" ? (
              <BouncingDots size={20} className="gap-1! *:size-1!" />
            ) : null}
            <span className="sr-only">Loading more links</span>
          </>
        ) : loadFailed ? (
          <span className="flex items-center gap-2">
            <Typography component="span" size="small">
              Unable to load more links.
            </Typography>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => void loadMore()}
            >
              Try again
            </Button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A grid cell that spans as many 1px rows as its card is tall, plus the
 * vertical gutter (its bottom padding, the same as the column gap: 16px,
 * 40px from md). Measured before paint and again whenever the card
 * resizes (fonts, a title rewrapping). Before `masonry` is on, the cell is
 * a plain grid row (its padding is still the gutter).
 */
function MasonryItem({
  masonry,
  className,
  style,
  children,
}: {
  masonry: boolean;
  /** For the card's box (e.g. its arrival animation). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [span, setSpan] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // Nearest pixel: fractional card heights (16:10 thumbnails) round to
    // within half a pixel of the gutter, either way.
    const measure = () =>
      setSpan(Math.round(box.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <li
      // In masonry, hidden until measured so cards never paint stacked on
      // each other (a card added later is measured before its first paint).
      className={masonry && span === null ? "invisible" : undefined}
      style={
        masonry && span !== null ? { gridRowEnd: `span ${span}` } : undefined
      }
    >
      <div
        ref={boxRef}
        className={cn("pb-4 md:pb-10", className)}
        style={style}
      >
        {children}
      </div>
    </li>
  );
}
