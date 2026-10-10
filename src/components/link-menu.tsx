"use client";

import { useIsPhone } from "@/hooks/use-is-phone";
import { copyToClipboard } from "@/lib/clipboard";
import { haptic } from "@/lib/haptics";
import type { Link as LinkType } from "@/utils/links";
import {
  Export5,
  Link,
  MoreH,
  Pen,
  Trash2,
} from "reicon-react";
import { toast } from "sonner";
import { EditDialog } from "./dialog-edit-link";
import { DropdownWrapper } from "./dropdown-wrapper";
import { HapticTarget } from "./haptic-target";
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
  /** The menu opened or closed (e.g. to keep its trigger shown meanwhile). */
  onOpenChange?: (open: boolean) => void;
}

export function LinkMenu({ link, onDelete, onOpenChange }: LinkMenuProps) {
  const isPhone = useIsPhone();

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
      onOpenChange={onOpenChange}
      trigger={
        <Button
          aria-label="Open link menu"
          variant="ghost"
          size="icon-sm"
          // A 44px hit area around the 32px button (fits the row's padding).
          className="relative cursor-pointer text-muted-foreground after:absolute after:-inset-1.5"
        >
          <MoreH />
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
          <Export5 /> Open in new tab
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
            <Pen /> Edit
          </DropdownMenuItem>
        </EditDialog>
        <DropdownMenuItem
          data-cy="delete-link-menu-item"
          variant="destructive"
          // A click from the keyboard (Enter/Space) has no pointer: detail 0.
          onClick={(event) => {
            const byKeyboard = event.detail === 0;
            if (!byKeyboard) haptic("warning");
            onDelete({ byKeyboard });
          }}
        >
          <Trash2 /> Delete
          <HapticTarget />
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownWrapper>
  );
}
