import { ContentTypeProps } from "@/sections/content-type";
import { Typography } from "./typography";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

interface ContentTypeGroupProps {
  contentTypes: ContentTypeProps[];
}

export default function ContentTypeGroup({
  contentTypes,
}: ContentTypeGroupProps) {
  return (
    <ItemGroup className="max-w-lg">
      {contentTypes.map((contentType) => (
        <Item key={contentType.type} variant="outline">
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
            <ItemDescription className="font-light text-muted-foreground">
              {contentType.description}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="flex items-center justify-center px-4 py-2 border border-border/80 rounded-md">
              <Typography size="mini">{contentType.access}</Typography>
            </div>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
