"use client";

import { useHasApiKey } from "@/contexts/api-key-context";
import { useChatContextSafe } from "@/contexts/chat-context";
import { copyToClipboard } from "@/lib/clipboard";
import type { Link as LinkType } from "@/utils/links";
import { Ellipsis, Link, Pencil, ScrollText, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EditDialog } from "./dialog-edit-link";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

interface LinkMenuProps {
  link: LinkType;
  onDeleteStart?: () => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: () => void;
}

export function LinkMenu({
  link,
  onDeleteStart,
  onDeleteSuccess,
  onDeleteError,
}: LinkMenuProps) {
  const router = useRouter();
  const chatCtx = useChatContextSafe();
  const hasApiKey = useHasApiKey();

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
    try {
      const res = await fetch(`/api/links/${link.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Link deleted");
        if (onDeleteSuccess) {
          onDeleteSuccess();
          return;
        }
        router.refresh();
      } else {
        onDeleteError?.();
        toast.error("Failed to delete link");
      }
    } catch {
      onDeleteError?.();
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
        <DropdownMenuItem
          disabled={link.ingestStatus !== "COMPLETED" || !hasApiKey}
          onSelect={() => {
            chatCtx?.triggerSummarize(link);
          }}
        >
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
