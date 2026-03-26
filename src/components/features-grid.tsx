import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Typography } from "./typography";

export type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function FeaturesGrid({ features }: { features: Feature[] }) {
  return (
    <ItemGroup className="grid grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-border bg-transparent md:grid-cols-2 lg:grid-cols-3">
      {features.map((feature, index) => {
        const Icon = feature.icon;

        return (
          <Item
            key={feature.title}
            variant="outline"
            className={cn(
              "min-h-52 flex-col items-start gap-5 rounded-none border-0 border-border/70 bg-transparent px-8 py-9 md:min-h-56 lg:min-h-64",
              index < features.length - 1 && "border-b",
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
            <ItemContent className="mt-2 flex flex-col gap-4">
              <ItemTitle>
                <Typography
                  component="h3"
                  className="font-medium text-foreground"
                >
                  {feature.title}
                </Typography>
              </ItemTitle>
              <ItemDescription className="font-light text-muted-foreground line-clamp-3">
                {feature.description}
              </ItemDescription>
            </ItemContent>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
