import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Typography } from "../typography";
import { Spinner } from "../ui/spinner";

export function LinkItemSkeleton({ url }: { url: string }) {
  return (
    <Item
      role="listitem"
      aria-busy
      className="p-2 gap-4 grid grid-cols-[20px_1fr] relative pointer-events-none"
    >
      <ItemMedia variant="image" className="size-5 rounded-none">
        <Spinner className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex flex-col gap-1">
          <Typography
            size="small"
            className="font-normal text-muted-foreground animate-pulse"
          >
            {url}
          </Typography>
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
