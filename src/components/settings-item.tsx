import { cn } from "@/lib/utils";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "./ui/item";

interface SettingsItemProps {
  title: string;
  description: string;
  /** Show the full description instead of clamping it to two lines. */
  fullDescription?: boolean;
  actions: React.ReactNode;
}

export function SettingsItem({
  title,
  description,
  fullDescription = false,
  actions,
}: SettingsItemProps) {
  return (
    <Item className="px-0">
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {description && (
          <ItemDescription
            className={cn(
              "text-xs text-muted-foreground wrap-anywhere",
              fullDescription && "line-clamp-none",
            )}
          >
            {description}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>{actions}</ItemActions>
    </Item>
  );
}
