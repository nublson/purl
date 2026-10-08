import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

interface UserItemProps {
  user: {
    name: string;
    /** `@username`, under the name. */
    handle: string;
    image?: string;
  };
}

/** Account header in the user menu. Display only. */
export function UserItem({ user }: UserItemProps) {
  return (
    <Item size="xs" className="w-full p-2">
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center">
        <Avatar className="size-7">
          <AvatarImage src={user.image ?? ""} alt="" />
          <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle>{user?.name}</ItemTitle>
        <ItemDescription
          className="line-clamp-1 wrap-anywhere"
          title={user?.handle}
        >
          {user?.handle}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
