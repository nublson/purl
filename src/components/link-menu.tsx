import type { Link as LinkType } from "@/utils/links";
import { Ellipsis, Link, MessageCircle, Pencil, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function LinkMenu({ link }: { link: LinkType }) {
  const router = useRouter();

  async function handleDelete() {
    const res = await fetch(`/api/links/${link.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Link deleted");
      router.refresh();
    } else {
      toast.error("Failed to delete link");
    }
  }

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
        <DropdownMenuItem
          variant="destructive"
          onClick={handleDelete}
        >
          <Trash /> Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownWrapper>
  );
}
