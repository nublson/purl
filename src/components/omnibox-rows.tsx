"use client";

import { formatDomain } from "@/utils/formatter";
import type { Link } from "@/utils/links";
import { ArrowUpRight, Plus } from "lucide-react";
import * as React from "react";
import { LinkIcon } from "./link-icon";
import { TooltipWrapper } from "./tooltip-wrapper";
import { Typography } from "./typography";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

/** Shared row shape: the list rows' 48px height, 20px media column and 16px gap. */
const ROW =
  "grid h-12 w-full grid-cols-[20px_1fr_auto] items-center gap-4 rounded-md p-2 text-start outline-none transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring";

/** Wait for the URL to settle before fetching its preview. */
const PREVIEW_DEBOUNCE_MS = 300;

type Preview = Pick<
  Link,
  "url" | "domain" | "title" | "favicon" | "thumbnail" | "contentType" | "description"
>;

/** Previews already fetched this session, by URL. */
const previewCache = new Map<string, Preview>();

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
  const cached = previewCache.get(url) ?? null;

  React.useEffect(() => {
    if (previewCache.has(url)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/links/preview?url=${encodeURIComponent(url)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const preview = (await res.json()) as Preview;
          previewCache.set(url, preview);
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
 * when the URL is already saved; saving again just refreshes it (or files
 * it into this folder).
 */
export function OmniboxSaveRow({
  url,
  alreadySaved,
  onSave,
}: {
  url: string;
  alreadySaved: boolean;
  onSave: () => void;
}) {
  const preview = useLinkPreview(url);
  const shown = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const link: Link | null = preview
    ? { ...preview, id: "preview", createdAt: new Date(0), folderId: null }
    : null;

  return (
    <div
      data-cy="omnibox-save-row"
      className="grid h-12 w-full grid-cols-[20px_1fr_auto] items-center gap-4 rounded-md p-2"
    >
      <Typography
        component="span"
        aria-hidden
        className="relative flex size-5 items-center justify-center overflow-hidden rounded"
      >
        {link ? (
          <LinkIcon link={link} size="default" />
        ) : (
          <Skeleton className="size-5 rounded" />
        )}
      </Typography>
      <Typography component="span" className="flex min-w-0 items-baseline gap-2">
        <Typography
          component="span"
          size="small"
          className="min-w-0 truncate font-medium text-accent-foreground"
        >
          {link?.title ?? shown}
        </Typography>
        <Typography component="span" size="small" className="hidden shrink-0 md:block">
          {link ? formatDomain(link.domain) : null}
        </Typography>
        {alreadySaved ? (
          <Typography component="span" size="mini" className="shrink-0">
            Already saved
          </Typography>
        ) : null}
      </Typography>
      <TooltipWrapper content="Save (↵)">
        {/* Primary: the one thing this not-yet-saved row is for (and what
            Enter does). Already saved, saving again only refreshes it. */}
        <Button
          variant={alreadySaved ? "outline" : "default"}
          size="icon-sm"
          aria-label={`Save ${link?.title ?? shown}${alreadySaved ? " (already saved)" : ""}`}
          className="cursor-pointer"
          onClick={onSave}
        >
          <Plus />
        </Button>
      </TooltipWrapper>
    </div>
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
