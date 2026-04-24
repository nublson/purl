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
  actions: React.ReactNode;
}

export function SettingsItem({
  title,
  description,
  actions,
}: SettingsItemProps) {
  return (
    <Item className="px-0">
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {description && (
          <ItemDescription className="font-light text-xs text-muted-foreground">
            {description}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>{actions}</ItemActions>
    </Item>
  );
}
