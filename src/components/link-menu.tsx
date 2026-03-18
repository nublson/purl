import { Ellipsis, Link, Pencil, Trash } from "lucide-react";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Button } from "./ui/button";
import { DropdownMenuGroup, DropdownMenuItem } from "./ui/dropdown-menu";

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
      align="center"
      className="w-full"
    >
      <DropdownMenuGroup>
        <DropdownMenuItem disabled>
          <Link /> Copy link
        </DropdownMenuItem>
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
