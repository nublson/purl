import { Ellipsis, Link, MessageCircle, Pencil, Trash } from "lucide-react";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function LinkMenu() {
  return (
    <DropdownWrapper
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-muted-foreground"
        >
          <Ellipsis />
        </Button>
      }
      align="end"
      className="w-full"
    >
      <DropdownMenuGroup>
        <DropdownMenuItem disabled>
          <MessageCircle /> Add to chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Link /> Copy link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Trash /> Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownWrapper>
  );
}
