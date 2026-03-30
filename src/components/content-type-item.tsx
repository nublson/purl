import type { ContentTypeProps } from "@/sections/content-type";
import { Typography } from "./typography";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

interface ContentTypeItemProps {
  contentType: ContentTypeProps;
}

export default function ContentTypeItem({ contentType }: ContentTypeItemProps) {
  return (
    <Item variant="outline">
      <ItemMedia
        variant="icon"
        className="size-8 rounded-md border border-border/80 text-foreground group-has-data-[slot=item-description]/item:self-center"
      >
        <contentType.icon className="size-4" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Typography
            component="h3"
            className="font-medium text-accent-foreground"
          >
            {contentType.type}
          </Typography>
        </ItemTitle>
        <ItemDescription className="font-light text-muted-foreground line-clamp-1">
          {contentType.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <div className="flex items-center justify-center px-4 py-2 border border-border/80 rounded-md">
          <Typography size="mini">{contentType.access}</Typography>
        </div>
      </ItemActions>
    </Item>
  );
}
