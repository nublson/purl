import { cn } from "@/lib/utils";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "../ui/spinner";

interface LinkItemSkeletonProps {
  icon?: React.ReactNode;
  url: string;
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
  animateIn = false,
  animateOut = false,
  onAnimationEnd,
  asListItem = true,
}: LinkItemSkeletonProps) {
  return (
    <Item
      role={asListItem ? "listitem" : undefined}
      aria-busy
      onAnimationEnd={onAnimationEnd}
      className={cn(
        "p-2 gap-4 grid h-[50px] grid-cols-[20px_1fr] relative pointer-events-none",
        animateIn && "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        animateOut &&
          "overflow-hidden border-0 animate-out fade-out-0 slide-out-to-left-2 duration-200 h-0 py-0",
      )}
    >
      <ItemMedia
        variant="image"
        className="size-5 rounded text-muted-foreground animate-pulse"
      >
        {icon || <Spinner />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex flex-col gap-1">
          <p className="text-sm font-normal text-muted-foreground animate-pulse line-clamp-1 wrap-anywhere">
            {url}
          </p>
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
