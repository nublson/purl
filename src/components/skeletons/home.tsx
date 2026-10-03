import { Search } from "lucide-react";
import { OMNIBOX_SHELL } from "../omnibox-shell";
import { Typography } from "../typography";
import { Skeleton } from "../ui/skeleton";

/** Title widths for the placeholder rows, so they don't read as one block. */
const TITLE_WIDTHS = ["w-2/5", "w-3/5", "w-1/3", "w-1/2", "w-2/5", "w-3/5"];

/**
 * Loading state for Home and folder pages, laid out like what replaces it:
 * a date heading, rows with a favicon and a title (48px, no background,
 * like real rows) and the search field pinned at the bottom.
 */
export function HomeSkeleton() {
  return (
    <div aria-busy className="flex w-full flex-col gap-4">
      <Typography component="span" className="sr-only" role="status">
        Loading links
      </Typography>
      <Skeleton className="ms-2 h-4 w-10" />
      <div className="flex flex-col">
        {TITLE_WIDTHS.map((width, index) => (
          <div
            key={index}
            className="grid h-12 grid-cols-[20px_1fr] items-center gap-4 p-2"
          >
            <Skeleton className="size-5 rounded" />
            <Skeleton className={`h-3.5 ${width}`} />
          </div>
        ))}
      </div>
      <div aria-hidden className={OMNIBOX_SHELL}>
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Skeleton className="h-3.5 w-40" />
      </div>
    </div>
  );
}
