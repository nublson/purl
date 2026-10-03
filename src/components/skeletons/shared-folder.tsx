import type { SharedFolderView } from "@/lib/shared-folder-view";
import { cn } from "@/lib/utils";
import { Typography } from "../typography";
import { Skeleton } from "../ui/skeleton";

/** Title widths for placeholder rows, so they don't read as one block. */
const ROW_TITLE_WIDTHS = ["w-2/5", "w-3/5", "w-1/3", "w-1/2", "w-2/5", "w-3/5"];
/** Placeholder cards on first load: two rows at four columns. */
const FIRST_LOAD_CARDS = 8;

/** Grid columns and gutters, shared with the real grid (shared-folder-list). */
export const SHARED_GRID_COLUMNS =
  "grid-cols-[repeat(2,minmax(0,210px))] justify-center gap-x-4 md:grid-cols-[repeat(3,minmax(0,210px))] md:gap-x-10 lg:grid-cols-[repeat(4,minmax(0,210px))]";

/**
 * A grid card while it loads: the real card's frame, thumbnail box and
 * favicon / title / domain lines (`SharedLinkCard`).
 */
export function SharedLinkCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10"
    >
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2 gap-y-2.5 p-3 md:gap-x-3 md:p-4">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="col-start-2 h-3.5 w-1/2" />
      </div>
    </div>
  );
}

/**
 * The shared folder page while it loads, in the visitor's view: rows like
 * the list, or a grid of card placeholders.
 */
export function SharedFolderSkeleton({ view }: { view: SharedFolderView }) {
  return (
    <div
      aria-busy
      className={cn(
        "flex flex-1 flex-col pt-24 pb-12",
        view === "grid" ? "mx-auto w-full max-w-[960px]" : "wrapper-private",
      )}
    >
      <Typography component="span" className="sr-only" role="status">
        Loading links
      </Typography>
      {view === "grid" ? (
        <div className={cn("grid w-full gap-y-4 md:gap-y-10", SHARED_GRID_COLUMNS)}>
          {Array.from({ length: FIRST_LOAD_CARDS }, (_, index) => (
            <SharedLinkCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {ROW_TITLE_WIDTHS.map((width, index) => (
            <div
              key={index}
              className="grid h-12 grid-cols-[20px_1fr] items-center gap-4 p-2"
            >
              <Skeleton className="size-5 rounded" />
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
