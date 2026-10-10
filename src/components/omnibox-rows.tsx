"use client";

import { ARRIVE, ARRIVE_ICON, ARRIVE_LATE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatDomain } from "@/utils/formatter";
import type { Link } from "@/utils/links";
import { ArrowUpRight, FolderMove, Plus } from "reicon-react";
import * as React from "react";
import { LinkIcon } from "./link-icon";
import { Typography } from "./typography";
import { buttonVariants } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

/** Shared row shape: the list rows' 48px height, 20px media column and 16px gap. */
const ROW =
  "grid h-12 w-full grid-cols-[20px_1fr_auto] items-center gap-4 rounded-md p-2 text-start outline-none transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring";

/** Wait for the URL to settle before fetching its preview. */
const PREVIEW_DEBOUNCE_MS = 300;

type Preview = Pick<
  Link,
  "url" | "domain" | "title" | "favicon" | "thumbnail" | "contentType" | "description"
> & {
  /** You already have this URL: saving refreshes that link. */
  saved: boolean;
};

/** How long a fetched preview is reused (typing the same URL again). */
const PREVIEW_TTL_MS = 5 * 60_000;
/** Most previews kept; the oldest go first. */
const PREVIEW_CACHE_SIZE = 50;

/** Recent previews by URL, oldest first (Map keeps insertion order). */
const previewCache = new Map<string, { preview: Preview; at: number }>();

function cachedPreview(url: string): Preview | null {
  const entry = previewCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.at > PREVIEW_TTL_MS) {
    previewCache.delete(url);
    return null;
  }
  return entry.preview;
}

function cachePreview(url: string, preview: Preview) {
  previewCache.delete(url);
  previewCache.set(url, { preview, at: Date.now() });
  while (previewCache.size > PREVIEW_CACHE_SIZE) {
    const oldest = previewCache.keys().next().value;
    if (oldest === undefined) break;
    previewCache.delete(oldest);
  }
}

/** Drops `url`'s preview, e.g. once it's saved (its `saved` is now stale). */
export function forgetLinkPreview(url: string) {
  previewCache.delete(url);
}

/**
 * `url`'s preview (`GET /api/links/preview`), fetched once the URL has
 * settled; null while loading or if it failed.
 */
function useLinkPreview(url: string): Preview | null {
  // Keyed by URL, so a preview for an earlier URL never shows for this one.
  const [fetched, setFetched] = React.useState<{
    url: string;
    preview: Preview;
  } | null>(null);
  const cached = cachedPreview(url);

  React.useEffect(() => {
    if (cachedPreview(url)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/links/preview?url=${encodeURIComponent(url)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const preview = (await res.json()) as Preview;
          cachePreview(url, preview);
          setFetched({ url, preview });
        })
        .catch(() => {
          // No preview: the row keeps showing the URL itself.
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  return cached ?? (fetched?.url === url ? fetched.preview : null);
}

/**
 * First row of the list while the search field holds a URL: the link as it
 * would look saved (favicon, title, domain, from a preview fetch), with +
 * where a saved row has its menu. + (or Enter in the field) saves it. Says
 * when the URL is already saved (the server's answer once the preview is
 * in; `alreadySaved`, from the loaded list, until then); saving again just
 * refreshes it (or files it into this folder).
 *
 * On a folder page (`folderName`), a URL you've saved elsewhere moves into
 * this folder: the + becomes the row menu's "Move to folder" icon.
 */
export function OmniboxSaveRow({
  url,
  alreadySaved,
  folderName,
  onSave,
}: {
  url: string;
  /** In the loaded list (on a folder page: already in this folder). */
  alreadySaved: boolean;
  folderName?: string;
  onSave: () => void;
}) {
  const preview = useLinkPreview(url);
  // The server knows every saved link; the loaded list is only a first guess.
  const saved = preview ? preview.saved : alreadySaved;
  const shown = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const link: Link | null = preview
    ? { ...preview, id: "preview", createdAt: new Date(0), folderId: null }
    : null;

  // Saved, but not in this folder's list: saving moves it here.
  const moves = Boolean(folderName) && saved && !alreadySaved;
  const label = moves
    ? `Add ${link?.title ?? shown} to ${folderName} (already saved)`
    : `Save ${link?.title ?? shown}${saved ? " (already saved)" : ""}`;
  return (
    // The whole row saves (as Enter in the field does).
    <button
      type="button"
      data-cy="omnibox-save-row"
      aria-label={label}
      className="group/save grid h-12 w-full cursor-pointer grid-cols-[20px_1fr_auto] items-center gap-4 rounded-md p-2 text-start outline-none transition-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring"
      onClick={onSave}
    >
      <Typography
        component="span"
        aria-hidden
        className="relative flex size-5 items-center justify-center overflow-hidden rounded"
      >
        {link ? (
          // The preview arriving: the favicon, then title, then domain
          // fade in as their blur clears (see ARRIVE).
          <Typography component="span" className={cn("flex", ARRIVE_ICON)}>
            <LinkIcon link={link} size="default" />
          </Typography>
        ) : (
          <Skeleton className="size-5 rounded" />
        )}
      </Typography>
      <Typography component="span" className="flex min-w-0 items-baseline gap-2">
        <Typography
          // Remounts when the preview lands, so the title plays its arrival.
          key={link ? "title" : "url"}
          component="span"
          size="small"
          className={cn(
            "min-w-0 truncate font-medium text-accent-foreground",
            link && ARRIVE,
          )}
        >
          {link?.title ?? shown}
        </Typography>
        <Typography
          component="span"
          size="small"
          className={cn("hidden shrink-0 md:block", link && ARRIVE_LATE)}
        >
          {link ? formatDomain(link.domain) : null}
        </Typography>
        {saved ? (
          <Typography component="span" size="mini" className="shrink-0">
            Already saved
          </Typography>
        ) : null}
      </Typography>
      {/* The row's cue, drawn as a button: primary for the one thing this
          not-yet-saved row is for; outline when it's already saved and
          saving again only refreshes it. */}
      {/* A 24px button centred in the 32px slot a saved row's ⋯ menu takes,
          so the two line up down the list. */}
      <Typography
        component="span"
        aria-hidden
        className="flex size-8 items-center justify-center"
      >
        <Typography
          component="span"
          className={cn(
            buttonVariants({
              variant: saved ? "outline" : "default",
              size: "icon-xs",
            }),
            // Press feedback lives on the +: scaling the whole row would look wrong.
            "pointer-events-none ease-out-strong group-active/save:scale-[0.96]",
          )}
        >
          {moves ? <FolderMove /> : <Plus />}
        </Typography>
      </Typography>
    </button>
  );
}

/** Last row of a folder's search results: runs the same search over every link. */
export function OmniboxSearchAllRow({
  query,
  onSearchAll,
}: {
  query: string;
  onSearchAll: () => void;
}) {
  return (
    <button type="button" className={ROW} onClick={onSearchAll}>
      <Typography
        component="span"
        aria-hidden
        className="flex size-5 items-center justify-center text-muted-foreground"
      >
        <ArrowUpRight className="size-4" />
      </Typography>
      <Typography component="span" size="small" className="min-w-0 truncate">
        Search all links for “{query}”
      </Typography>
      <Typography component="span" aria-hidden />
    </button>
  );
}
