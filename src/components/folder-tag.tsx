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
  className,
}: {
  folder: FolderSummary;
  className?: string;
}) {
  return (
    <Typography
      component="span"
      size="mini"
      data-cy="folder-tag"
      className={cn(
        "inline-flex h-5 max-w-40 min-w-0 shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 font-normal",
        className,
      )}
    >
      <FolderEmoji emoji={folder.emoji} className="size-3 text-xs" />
      <Typography component="span" size="mini" className="truncate">
        {folder.name}
      </Typography>
    </Typography>
  );
}
