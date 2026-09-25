"use client";

import { copyToClipboard } from "@/lib/clipboard";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { linksOriginHeaders } from "@/lib/links-origin";
import type { Link as LinkType } from "@/utils/links";
import {
  Ellipsis,
  ExternalLink,
  Link,
  Pencil,
  Trash,
} from "lucide-react";
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
  const { notifyLinksChanged } = useLinksSyncActions();

  async function handleOpenInNewTab() {
    window.open(link.url, "_blank");
  }

  async function handleCopyLink() {
    try {
      await copyToClipboard(link.url);
      toast.success("Link copied");
    } catch {
      toast.error("Unable to copy the link. Try again.");
    }
  }

  async function handleDelete() {
    onDeleteStart?.();
    try {
      const res = await fetch(`/api/links/${link.id}`, {
        method: "DELETE",
        headers: linksOriginHeaders,
      });
      if (res.ok) {
        toast.success("Link deleted");
        if (onDeleteSuccess) {
          onDeleteSuccess();
          return;
        }
        notifyLinksChanged();
      } else {
        onDeleteError?.();
        toast.error("Unable to delete the link. Check your connection and try again.");
      }
    } catch {
      onDeleteError?.();
      toast.error("Unable to delete the link. Check your connection and try again.");
    }
  }

  return (
    <DropdownWrapper
      trigger={
        <Button
          aria-label="Open link menu"
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
          onSelect={() => {
            void handleOpenInNewTab();
          }}
        >
          <ExternalLink /> Open in new tab
        </DropdownMenuItem>
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
        <DropdownMenuItem data-cy="delete-link-menu-item" variant="destructive" onClick={handleDelete}>
          <Trash /> Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownWrapper>
  );
}
