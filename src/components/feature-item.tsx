import { cn } from "@/lib/utils";
import type { Feature } from "./features-grid";
import { Typography } from "./typography";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

interface FeatureItemProps {
  feature: Feature;
  index: number;
  length: number;
}

export default function FeatureItem({
  feature,
  index,
  length,
}: FeatureItemProps) {
  const Icon = feature.icon;

  return (
    <Item
      variant="outline"
      className={cn(
        "flex-col items-start gap-5 rounded-none border-0 border-border/70 bg-transparent px-8 py-9",
        index < length - 1 && "border-b",
        index < 4 && "md:border-b",
        index >= 4 && "md:border-b-0",
        index % 2 === 0 && "md:border-r",
        index % 2 === 1 && "md:border-r-0",
        index < 3 && "lg:border-b",
        index >= 3 && "lg:border-b-0",
        index % 3 !== 2 && "lg:border-r",
        index % 3 === 2 && "lg:border-r-0",
      )}
    >
      <ItemMedia
        variant="icon"
        className="size-9 rounded-md border border-border/80 text-neutral-600"
      >
        <Icon className="size-4" />
      </ItemMedia>
      <ItemContent className="flex flex-col gap-3">
        <ItemTitle>
          <Typography component="h3" className="font-medium text-foreground">
            {feature.title}
          </Typography>
        </ItemTitle>
        <ItemDescription className="font-light text-muted-foreground line-clamp-3">
          {feature.description}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
