"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { LINK_GRID_COLUMNS } from "@/lib/link-view";
import { cn } from "@/lib/utils";
import { Search } from "reicon-react";
import { OMNIBOX_SHELL } from "../omnibox-shell";
import { Typography } from "../typography";
import { Skeleton } from "../ui/skeleton";
import { SharedLinkCardSkeleton } from "./shared-folder";

/** Placeholder cards in the grid view: two rows at four columns. */
const GRID_CARDS = 8;

/** Title widths for the placeholder rows, so they don't read as one block. */
const TITLE_WIDTHS = ["w-2/5", "w-3/5", "w-1/3", "w-1/2", "w-2/5", "w-3/5"];

/**
 * Loading state for Home and folder pages, laid out like what replaces it
 * in the owner's view: a date heading, then rows with a favicon and a
 * title (48px, no background, like real rows) or a grid of card
 * placeholders, and the search field pinned at the bottom.
 */
export function HomeSkeleton() {
  return (
    <div aria-busy className="flex w-full flex-col gap-4">
      <Typography component="span" className="sr-only" role="status">
        Loading links
      </Typography>
      <LinkResultsSkeleton />
      <div aria-hidden className={OMNIBOX_SHELL}>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Skeleton className="h-3.5 w-40" />
      </div>
    </div>
  );
}

/**
 * Links on their way, in the owner's view: a day heading, then rows (a
 * favicon and a title, 48px like real rows) or a grid of card
 * placeholders. Decorative; the caller says what's loading. A search's
 * results (`rows` / `cards`) are usually fewer than a page.
 */
export function LinkResultsSkeleton({
  rows = TITLE_WIDTHS.length,
  cards = GRID_CARDS,
}: {
  rows?: number;
  cards?: number;
}) {
  const { view } = useLinkView();
  return view === "grid" ? (
    <div aria-hidden className="flex w-full flex-col gap-4">
      <div className={cn("grid w-full", LINK_GRID_COLUMNS)}>
        <Skeleton className="col-span-full h-4 w-10" />
      </div>
      <div className={cn("grid w-full gap-y-4 md:gap-y-10", LINK_GRID_COLUMNS)}>
        {Array.from({ length: cards }, (_, index) => (
          <SharedLinkCardSkeleton key={index} />
        ))}
      </div>
    </div>
  ) : (
    <div aria-hidden className="flex w-full flex-col gap-4">
      <Skeleton className="ms-2 h-4 w-10" />
      <SkeletonRows widths={TITLE_WIDTHS.slice(0, rows)} />
    </div>
  );
}

/**
 * The search field's "Add to [folder]" section on its way: its heading and
 * rows like its own (favicon, title, the move button's slot). Always a
 * list, in the list's column, as the section itself.
 */
export function OmniboxAddSkeleton() {
  return (
    <div aria-hidden className="wrapper-private flex flex-col gap-4">
      <Skeleton className="ms-2 h-4 w-28" />
      <SkeletonRows widths={["w-1/2", "w-2/5"]} action />
    </div>
  );
}

function SkeletonRows({
  widths,
  action = false,
}: {
  widths: string[];
  /** A 24px button in the 32px slot at the row's end (Add rows). */
  action?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {widths.map((width, index) => (
        <div
          key={index}
          className={cn(
            "grid h-12 items-center gap-4 p-2",
            action
              ? "grid-cols-[20px_1fr_auto]"
              : "grid-cols-[20px_1fr] max-md:h-14 max-md:grid-cols-[24px_1fr]",
          )}
        >
          <Skeleton className={cn("size-5 rounded", !action && "max-md:size-6")} />
          <Skeleton className={`h-3.5 ${width}`} />
          {action ? (
            <span className="flex size-8 items-center justify-center">
              <Skeleton className="size-6 rounded-md" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
