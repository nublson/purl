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
        "border-0 p-2 gap-4 grid h-12 grid-cols-[20px_1fr] relative pointer-events-none max-md:h-14 max-md:grid-cols-[24px_1fr]",
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
        {icon || <Spinner />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex flex-col gap-1">
          <p className="text-sm font-normal text-muted-foreground animate-pulse line-clamp-1 wrap-anywhere max-md:text-base">
            {url}
          </p>
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
