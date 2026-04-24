import type { User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

interface UserItemProps {
  user: User;
}

export function UserItem({ user }: UserItemProps) {
  return (
    <Item size="xs" className="w-full p-2">
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center">
        <Avatar className="size-7">
          <AvatarImage src={user?.image ?? ""} className="grayscale" />
          <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle>{user?.name}</ItemTitle>
        <ItemDescription className="leading-none">
          {user?.email}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
