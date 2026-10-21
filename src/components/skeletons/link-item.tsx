import { cn } from "@/lib/utils";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "../ui/spinner";

interface LinkItemSkeletonProps {
  icon?: React.ReactNode;
  url: string;
  /**
   * A multi-link paste's single indicator: where this save stands, "2/8",
   * on the right. The row stays mounted for the whole batch (only the URL
   * and the count change), and the spinner is quiet: one status says
   * "Saving 8 links" instead of one "Loading" per link.
   */
  progress?: { index: number; total: number };
  animateIn?: boolean;
  animateOut?: boolean;
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
  /**
   * Whether this skeleton is itself the list item. False when it replaces a
   * row whose wrapper already has `role="listitem"` (the delete animation).
   */
  asListItem?: boolean;
}

export function LinkItemSkeleton({
  icon,
  url,
  progress,
  animateIn = false,
  animateOut = false,
  onAnimationEnd,
  asListItem = true,
}: LinkItemSkeletonProps) {
  return (
    <Item
      role={asListItem ? "listitem" : undefined}
      aria-busy
      data-cy={progress ? "bulk-save-indicator" : undefined}
      onAnimationEnd={onAnimationEnd}
      className={cn(
        "border-0 p-2 gap-4 grid h-12 grid-cols-[20px_1fr] relative pointer-events-none max-md:h-14 max-md:grid-cols-[24px_1fr]",
        progress && "grid-cols-[20px_1fr_auto] max-md:grid-cols-[24px_1fr_auto]",
        animateIn && "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        animateOut &&
          "overflow-hidden animate-out fade-out-0 slide-out-to-left-2 duration-200 h-0 py-0",
      )}
    >
      <ItemMedia
        variant="image"
        // 2px below center: where LinkItem's favicon sits (on the middle of
        // the title's lowercase letters), so it doesn't jump on arrival.
        className="size-5 translate-y-0.5 rounded text-muted-foreground animate-pulse max-md:size-6"
      >
        {icon || (progress ? <Spinner aria-hidden /> : <Spinner />)}
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex flex-col gap-1">
          <p className="text-sm font-normal text-muted-foreground animate-pulse line-clamp-1 wrap-anywhere max-md:text-base">
            {url}
          </p>
        </ItemTitle>
      </ItemContent>
      {progress ? (
        <>
          {/* Its right edge sits where a saved row's ⋯ menu does. Steady
              (no pulse) with tabular figures, so the count never jitters. */}
          <span
            aria-hidden
            className="flex min-w-8 items-center justify-end text-sm text-muted-foreground tabular-nums max-md:text-base"
          >
            {progress.index}/{progress.total}
          </span>
          <span className="sr-only" role="status">
            Saving {progress.total} links
          </span>
        </>
      ) : null}
    </Item>
  );
}
