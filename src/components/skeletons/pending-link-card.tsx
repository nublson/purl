import type { PendingSave } from "@/lib/pending-save";
import { Spinner } from "../ui/spinner";
import { Skeleton } from "../ui/skeleton";

/**
 * The grid's indicator for a multi-link paste: one card for the whole batch,
 * in the real card's frame, with the spinner, the URL being saved and where
 * it stands ("2/8") on the title line. The list's `LinkItemSkeleton` does the
 * same as a row.
 */
export function PendingLinkCard({
  pending,
}: {
  pending: PendingSave & { progress: NonNullable<PendingSave["progress"]> };
}) {
  const { index, total } = pending.progress;
  return (
    <div
      aria-busy
      data-cy="bulk-save-indicator"
      className="flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10"
    >
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2.5 p-3 md:gap-x-3 md:p-4">
        <Spinner aria-hidden className="size-4 text-muted-foreground" />
        <p className="truncate text-sm text-muted-foreground animate-pulse">
          {pending.url}
        </p>
        <span
          aria-hidden
          className="text-sm text-muted-foreground tabular-nums"
        >
          {index}/{total}
        </span>
        <Skeleton className="col-span-2 col-start-2 h-3.5 w-1/2" />
      </div>
      <span className="sr-only" role="status">
        Saving {total} links
      </span>
    </div>
  );
}
