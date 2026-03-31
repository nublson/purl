"use client";

import { copyToClipboard } from "@/lib/clipboard";
import type { Link as LinkType } from "@/utils/links";
import { Ellipsis, Link, Pencil, ScrollText, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DropdownWrapper } from "./dropdown-wrapper";
import { EditDialog } from "./edit-dialog";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function LinkMenu({
  link,
  onDeleteStart,
}: {
  link: LinkType;
  onDeleteStart?: () => void;
}) {
  const router = useRouter();

  async function handleCopyLink() {
    try {
      await copyToClipboard(link.url);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  async function handleDelete() {
    onDeleteStart?.();
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
        <DropdownMenuItem>
          <ScrollText /> Summarize with AI
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void handleCopyLink();
          }}
        >
          <Link /> Copy link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <EditDialog link={link}>
          <DropdownMenuItem
            onSelect={(event) => {
              // Prevent Radix DropdownMenu from closing immediately, which unmounts EditDialog.
              event.preventDefault();
            }}
          >
            <Pencil /> Edit
          </DropdownMenuItem>
        </EditDialog>
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          <Trash /> Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownWrapper>
  );
}
