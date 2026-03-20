import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Typography } from "../typography";
import { Spinner } from "../ui/spinner";

interface LinkItemSkeletonProps {
  icon?: React.ReactNode;
  url: string;
}

export function LinkItemSkeleton({ icon, url }: LinkItemSkeletonProps) {
  return (
    <Item
      role="listitem"
      aria-busy
      className="p-2 gap-4 grid h-[50px] grid-cols-[20px_1fr] relative pointer-events-none"
    >
      <ItemMedia
        variant="image"
        className="size-5 rounded text-muted-foreground animate-pulse"
      >
        {icon || <Spinner />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex flex-col gap-1">
          <Typography
            size="small"
            className="font-normal text-muted-foreground animate-pulse line-clamp-1 break-all"
          >
            {url}
          </Typography>
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
