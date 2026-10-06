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
  const { view } = useLinkView();
  return (
    <div aria-busy className="flex w-full flex-col gap-4">
      <Typography component="span" className="sr-only" role="status">
        Loading links
      </Typography>
      {view === "grid" ? (
        <>
          <div className={cn("grid w-full", LINK_GRID_COLUMNS)}>
            <Skeleton className="col-span-full h-4 w-10" />
          </div>
          <div className={cn("grid w-full gap-y-4 md:gap-y-10", LINK_GRID_COLUMNS)}>
            {Array.from({ length: GRID_CARDS }, (_, index) => (
              <SharedLinkCardSkeleton key={index} />
            ))}
          </div>
        </>
      ) : (
        <>
          <Skeleton className="ms-2 h-4 w-10" />
          <div className="flex flex-col">
            {TITLE_WIDTHS.map((width, index) => (
              <div
                key={index}
                className="grid h-12 grid-cols-[20px_1fr] items-center gap-4 p-2 max-md:h-14 max-md:grid-cols-[24px_1fr]"
              >
                <Skeleton className="size-5 rounded max-md:size-6" />
                <Skeleton className={`h-3.5 ${width}`} />
              </div>
            ))}
          </div>
        </>
      )}
      <div aria-hidden className={OMNIBOX_SHELL}>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Skeleton className="h-3.5 w-40" />
      </div>
    </div>
  );
}
