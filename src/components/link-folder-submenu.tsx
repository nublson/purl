"use client";

import { useFolderActions, useFolders } from "@/hooks/use-folders";
import type { Link as LinkType } from "@/utils/links";
import { Check, FolderInput, FolderMinus } from "lucide-react";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./ui/dropdown-menu";

/**
 * "Move to folder" submenu for a link's menu: files the link into any of the
 * user's folders, or (when it's in one) takes it back out. The link's current
 * folder is checked and disabled. Toasts and list refreshes come from
 * `useFolderActions().moveLink`.
 */
export function LinkFolderSubmenu({ link }: { link: LinkType }) {
  const { folders } = useFolders();
  const { moveLink } = useFolderActions();
  const currentFolder = folders.find((folder) => folder.id === link.folderId);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInput />
        Move to folder
      </DropdownMenuSubTrigger>
      {/* Only this list scrolls when there are many folders; 7.5 rows tall so
          the half-visible last row shows that it scrolls. */}
      <DropdownMenuSubContent className="max-h-[min(15.25rem,var(--radix-dropdown-menu-content-available-height))] w-56 overflow-y-auto overscroll-y-contain">
        {folders.length === 0 ? (
          <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
        ) : (
          folders.map((folder) => {
            const active = folder.id === link.folderId;
            return (
              <DropdownMenuItem
                key={folder.id}
                disabled={active}
                onSelect={() => {
                  void moveLink(link.id, folder.id);
                }}
              >
                <FolderEmoji emoji={folder.emoji} />
                <Typography
                  component="span"
                  size="small"
                  className="min-w-0 flex-1 truncate text-foreground"
                >
                  {folder.name}
                </Typography>
                {active ? <Check aria-hidden="true" /> : null}
              </DropdownMenuItem>
            );
          })
        )}
        {currentFolder ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void moveLink(link.id, null, { folderName: currentFolder.name });
              }}
            >
              <FolderMinus />
              <Typography
                component="span"
                size="small"
                className="min-w-0 truncate text-foreground"
              >
                Remove from {currentFolder.name}
              </Typography>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
