"use client";

import { useFolderActions, useFolders } from "@/hooks/use-folders";
import { useIsPhone } from "@/hooks/use-is-phone";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import { Check, ChevronDown, FolderMinus, FolderMove } from "reicon-react";
import * as React from "react";
import { FolderEmoji } from "./folder-emoji";
import { HapticTarget } from "./haptic-target";
import { Typography } from "./typography";
import {
  DropdownMenuGroup,
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
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = React.useState(false);

  // Phones: no room beside the menu, so the folders open in place, right
  // under "Move to folder" (which stays put and toggles them).
  if (isPhone) {
    return (
      <>
        <DropdownMenuItem
          aria-expanded={expanded}
          onSelect={(event) => {
            event.preventDefault();
            setExpanded((open) => !open);
          }}
        >
          <FolderMove />
          Move to folder
          <ChevronDown
            aria-hidden="true"
            className={cn(
              // Reduced motion: it flips without turning.
              "ms-auto transition-transform duration-150 ease-out-strong motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </DropdownMenuItem>
        {expanded ? (
          <>
            {/* Lined up with the other items (no indent), and not a scroll
                box of its own: the menu scrolls when it's too tall (a
                nested one made iOS flash its scrollbar as it appeared).
                Arrives from just above (opacity and a 4px drop, no JS); it
                collapses at once. Reduced motion: the fade only. */}
            <DropdownMenuGroup className="transition-[opacity,translate] duration-150 ease-out-strong starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0">
              <LinkFolderItems link={link} />
            </DropdownMenuGroup>
            {/* The folders end here; the menu's own items (Edit, Delete)
                follow. */}
            <DropdownMenuSeparator />
          </>
        ) : null}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderMove />
        Move to folder
      </DropdownMenuSubTrigger>
      {/* Only this list scrolls when there are many folders; 7.5 rows tall so
          the half-visible last row shows that it scrolls. */}
      <DropdownMenuSubContent className={LINK_FOLDER_LIST}>
        <LinkFolderItems link={link} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** The folder list's box: scrolls past 7.5 rows (the half row says so). */
export const LINK_FOLDER_LIST =
  "max-h-[min(15.25rem,var(--radix-dropdown-menu-content-available-height))] w-56 overflow-y-auto overscroll-y-contain";

/**
 * The folders to move `link` into (its current one checked and disabled),
 * then "Remove from …" when it's in one. Menu items, for the row menu's
 * submenu (or in place under it on phones).
 */
export function LinkFolderItems({ link }: { link: LinkType }) {
  const { folders } = useFolders();
  const { moveLink } = useFolderActions();
  const currentFolder = folders.find((folder) => folder.id === link.folderId);

  return (
    <>
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
                haptic("success");
                void moveLink(link.id, folder.id, { from: link.folderId });
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
              <HapticTarget />
            </DropdownMenuItem>
          );
        })
      )}
      {currentFolder ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              haptic("success");
              void moveLink(link.id, null, { from: link.folderId });
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
            <HapticTarget />
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
