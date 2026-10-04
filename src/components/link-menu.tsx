"use client";

import { useIsPhone } from "@/hooks/use-is-phone";
import { copyToClipboard } from "@/lib/clipboard";
import { setLinksRead, useIsLinkRead } from "@/lib/link-read-state";
import type { Link as LinkType } from "@/utils/links";
import {
  Circle,
  CircleCheck,
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
  const read = useIsLinkRead(link);
  const isPhone = useIsPhone();

  async function handleOpenInNewTab() {
    window.open(link.url, "_blank");
    if (!read) void setLinksRead([link.id], true);
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
      // Phones: one fixed width (the widest it gets, with folders open
      // in place), so opening "Move to folder" doesn't resize the menu.
      className={isPhone ? "w-60" : "w-full"}
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
        <DropdownMenuItem
          data-cy="toggle-read-menu-item"
          onSelect={() => {
            void setLinksRead([link.id], !read);
          }}
        >
          {read ? (
            <>
              <Circle /> Mark as unread
            </>
          ) : (
            <>
              <CircleCheck /> Mark as read
            </>
          )}
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
