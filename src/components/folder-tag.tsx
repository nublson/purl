"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useCurrentFolder, useFolders } from "@/hooks/use-folders";
import type { FolderSummary } from "@/lib/folders";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
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
 * A folder emoji in a tag's chip: 12px on a one-em line (`leading-none`
 * after `text-xs`, whose own 16px line height would set the glyph off its
 * middle), in a box exactly as wide as the drawn emoji, not its advance.
 *
 * Optical, not geometric: Chromium draws Apple Color Emoji ~10.5px wide at
 * 12px but advances 15px, all of the extra air on the right. Centering that
 * advance in a 15px box (as before) set the ink 1.5px left of the box's
 * middle and left ~8px of empty space before the name, wider than the
 * chip's own padding, so the emoji read as detached from its label. Here
 * the box is 12px and the glyph starts at its left edge (`justify-start`):
 * the ink is centered in it and the air spills under the gap instead.
 *
 * WebKit (Safari on Mac and iPhone, every iOS browser) draws Apple Color
 * Emoji ~1.25x larger than Chromium at the same size: ~15px of artwork at
 * 12px, nearly filling the 20px chip. There it's 0.6rem (9.6px), which
 * draws ~12px, filling the same 12px box. `font: -apple-system-body` is a
 * WebKit-only keyword, so the query picks WebKit and nothing else.
 */
const EMOJI_IN_CHIP =
  "size-auto w-3 justify-start text-xs leading-none supports-[font:-apple-system-body]:text-[0.6rem]";

/**
 * A link's folder, as a small muted chip: the folder's emoji and name
 * (a long name truncates). Decorative next to the row's own text; the
 * name is in the accessibility tree as plain text. On phones, just the
 * emoji, with the name in a tooltip (`FolderTagIcon`).
 *
 * Both are rendered and CSS picks one (the `phone:` variant), so the
 * server's HTML is already right: deciding in JS (`useIsPhone`, false until
 * hydration) drew the full chip on phones for the first moments, then
 * swapped it for the emoji.
 */
export function FolderTag({
  folder,
  inCard = false,
  className,
}: {
  folder: FolderSummary;
  /**
   * In a grid card: the emoji sits in the favicon's column (a 16px slot,
   * the chip pulled left by its own padding) and the name starts where
   * the title does (the card's column gap), so the icons stack.
   */
  inCard?: boolean;
  className?: string;
}) {
  return (
    <>
      <Typography
        component="span"
        size="mini"
        data-cy="folder-tag"
        className={cn(
          // The emoji's side gets 1px less padding than the name's: a solid
          // color shape weighs more than the text's light edge, so equal
          // padding reads heavier on the emoji's side.
          "inline-flex h-5 min-w-0 shrink-0 items-center rounded-md bg-muted ps-[5px] pe-1.5 font-normal phone:hidden",
          inCard
            ? "-ms-[5px] max-w-full gap-2 md:gap-3"
            : // In a row, next to the title and domain: 1px down puts the
              // chip's smaller text on their baseline (centered on their
              // line box it sat 0.7–1.5px higher).
              "max-w-40 translate-y-px gap-[3px]",
          className,
        )}
      >
        <FolderEmoji
          emoji={folder.emoji}
          // A card: the 12px emoji centered in the favicon's 16px column.
          className={cn(EMOJI_IN_CHIP, inCard && "mx-0.5")}
        />
        {/* A long name truncates; the native tooltip shows it whole. */}
        <Typography component="span" size="mini" className="truncate" title={folder.name}>
          {folder.name}
        </Typography>
      </Typography>
      <FolderTagIcon folder={folder} inCard={inCard} className={className} />
    </>
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
  className,
}: {
  folder: FolderSummary;
  inCard: boolean;
  className?: string;
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
            "pointer-events-auto relative z-10 hidden size-5 shrink-0 items-center justify-center rounded-md bg-muted outline-none after:absolute after:-inset-1 focus-visible:ring-2 focus-visible:ring-ring",
            // A card: centered under the 16px favicon (the chip is 20px).
            inCard && "-ms-0.5",
            className,
            // Only on phones (after `className`, so it can't be overridden).
            "phone:flex",
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
          <FolderEmoji emoji={folder.emoji} className={EMOJI_IN_CHIP} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {folder.name}
      </TooltipContent>
    </Tooltip>
  );
}
