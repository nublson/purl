"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useCurrentFolder, useFolders } from "@/hooks/use-folders";
import type { FolderSummary } from "@/lib/folders";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { useIsPhone } from "@/hooks/use-is-phone";
import * as React from "react";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * The folder to tag `link` with, or null: only with folder tags on (the
 * user menu's Layout group), only on Home (on a folder page every link is
 * in that folder), and only for a link that's in one.
 */
export function useFolderTag(link: Pick<Link, "folderId">): FolderSummary | null {
  const { folderTags } = useLinkView();
  const { folders } = useFolders();
  const currentFolder = useCurrentFolder();
  if (!folderTags || currentFolder || !link.folderId) return null;
  return folders.find((folder) => folder.id === link.folderId) ?? null;
}

/**
 * A link's folder, as a small muted chip: the folder's emoji and name
 * (a long name truncates). Decorative next to the row's own text; the
 * name is in the accessibility tree as plain text. On phones, just the
 * emoji, with the name in a tooltip (`FolderTagIcon`).
 */
export function FolderTag({
  folder,
  inCard = false,
  className,
}: {
  folder: FolderSummary;
  /**
   * In a grid card: the emoji sits in the favicon's column (a 16px box,
   * the chip pulled left by its own padding) and the name starts where
   * the title does (the card's column gap), so the icons stack.
   */
  inCard?: boolean;
  className?: string;
}) {
  const isPhone = useIsPhone();
  if (isPhone) return <FolderTagIcon folder={folder} inCard={inCard} />;
  return (
    <Typography
      component="span"
      size="mini"
      data-cy="folder-tag"
      className={cn(
        "inline-flex h-5 min-w-0 shrink-0 items-center rounded-md bg-muted px-1.5 font-normal",
        inCard ? "-ms-1.5 max-w-full gap-2 md:gap-3" : "max-w-40 gap-1",
        className,
      )}
    >
      <FolderEmoji
        emoji={folder.emoji}
        className={inCard ? "size-4 text-xs" : "size-3 text-xs"}
      />
      <Typography component="span" size="mini" className="truncate">
        {folder.name}
      </Typography>
    </Typography>
  );
}

/**
 * Phones: the tag is only the folder's emoji (a square chip), and a tap
 * shows the folder's name in a tooltip (there's no hover). It's a button
 * of its own, above the row's link, so the tap doesn't open the link; a
 * 28px hit area around the 20px chip. Named "Folder: …" for screen
 * readers.
 */
function FolderTagIcon({
  folder,
  inCard,
}: {
  folder: FolderSummary;
  inCard: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-cy="folder-tag"
          aria-label={`Folder: ${folder.name}`}
          className={cn(
            "pointer-events-auto relative z-10 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted outline-none after:absolute after:-inset-1 focus-visible:ring-2 focus-visible:ring-ring",
            // A card: centered under the 16px favicon (the chip is 20px).
            inCard && "-ms-0.5",
          )}
          onClick={(event) => {
            // Not the row's (or card's) link underneath. Opens (Radix
            // closes it on the trigger's own press, so no toggle); a tap
            // anywhere else closes it.
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
        >
          <FolderEmoji emoji={folder.emoji} className="size-3 text-xs" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {folder.name}
      </TooltipContent>
    </Tooltip>
  );
}
