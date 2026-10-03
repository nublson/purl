"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import { Typography } from "./typography";
import { Kbd } from "./ui/kbd";

/** Shared row shape: the list rows' 48px height, 20px media column and 16px gap. */
const ROW =
  "grid h-12 w-full grid-cols-[20px_1fr_auto] items-center gap-4 rounded-md p-2 text-start outline-none transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring";

/**
 * First row of the list while the search field holds a URL: saves it
 * (Enter in the field does the same). Says so when the URL is already
 * saved; saving again just refreshes it (or files it into this folder).
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
  const shown = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <button
      type="button"
      aria-label={`Save ${shown}${alreadySaved ? " (already saved)" : ""}`}
      className={ROW}
      onClick={onSave}
    >
      <Typography
        component="span"
        aria-hidden
        className="flex size-5 items-center justify-center rounded bg-accent text-foreground"
      >
        <Plus className="size-3.5" />
      </Typography>
      <Typography component="span" className="flex min-w-0 items-baseline gap-2">
        <Typography
          component="span"
          size="small"
          className="shrink-0 font-medium text-accent-foreground"
        >
          Save
        </Typography>
        <Typography component="span" size="small" className="min-w-0 truncate">
          {shown}
        </Typography>
        {alreadySaved ? (
          <Typography component="span" size="mini" className="shrink-0">
            Already saved
          </Typography>
        ) : null}
      </Typography>
      <Kbd aria-hidden="true" className="me-1.5">
        ↵
      </Kbd>
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
