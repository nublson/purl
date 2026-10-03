"use client";

import { copyToClipboard } from "@/lib/clipboard";
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
import { LinkFolderSubmenu } from "./link-folder-submenu";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

interface LinkMenuProps {
  link: LinkType;
  /**
   * Delete was chosen; the row animates out, then deletes with Undo (see
   * `LinkItem`). `byKeyboard`: chosen with Enter/Space rather than a click.
   */
  onDelete: (opts: { byKeyboard: boolean }) => void;
}

export function LinkMenu({ link, onDelete }: LinkMenuProps) {
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
        <LinkFolderSubmenu link={link} />
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
        <DropdownMenuItem
          data-cy="delete-link-menu-item"
          variant="destructive"
          // A click from the keyboard (Enter/Space) has no pointer: detail 0.
          onClick={(event) => onDelete({ byKeyboard: event.detail === 0 })}
        >
          <Trash /> Delete
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownWrapper>
  );
}
