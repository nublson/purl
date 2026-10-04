"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useCurrentFolder, useFolders } from "@/hooks/use-folders";
import type { FolderSummary } from "@/lib/folders";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";

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
 * name is in the accessibility tree as plain text.
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
