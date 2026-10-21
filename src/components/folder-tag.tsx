"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useCurrentFolder, useFolders } from "@/hooks/use-folders";
import type { FolderSummary } from "@/lib/folders";
import { ARRIVE_ICON } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import NextLink from "next/link";
import * as React from "react";
import { FolderEmoji } from "./folder-emoji";
import { Typography } from "./typography";
import { Button } from "./ui/button";
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
 * Whether `folder`'s badge should play its arrival: true once the badge
 * appears on, or changes on, a row or card that was already showing (a
 * move from Home, Folder tags turned on), never on that row's first
 * render (a page load, back to Home, more links, a view switch), so a
 * list of badges never shimmers in. React's "adjust state when a prop
 * changes" pattern: no effect, no ref read during render.
 */
export function useFolderBadgeArrival(folder: FolderSummary | null): boolean {
  const id = folder?.id ?? null;
  const [shownId, setShownId] = React.useState(id);
  const [arrive, setArrive] = React.useState(false);
  if (id !== shownId) {
    setShownId(id);
    setArrive(id !== null);
  }
  return arrive;
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
 * A link's folder, as a small muted chip: the folder's emoji and name (a
 * long name truncates), after the title in the search field's "Add to
 * folder" rows; on a phone only its emoji (the row's own name says the
 * folder). List rows and grid cards use `FolderBadge` instead.
 *
 * Both are rendered and CSS picks one (the `phone:` variant), so the
 * server's HTML is already right: deciding in JS (`useIsPhone`, false until
 * hydration) would draw the full chip on phones for the first moments.
 */
export function FolderTag({ folder }: { folder: FolderSummary }) {
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
          "inline-flex h-5 min-w-0 max-w-40 shrink-0 items-center gap-[3px] rounded-md bg-muted ps-[5px] pe-1.5 font-normal",
          // After a title: 1px down puts the chip's smaller text on its
          // baseline (centered on the line box it sat 0.7–1.5px higher).
          "translate-y-px phone:hidden",
        )}
      >
        <FolderEmoji emoji={folder.emoji} className={EMOJI_IN_CHIP} />
        {/* A long name truncates; the native tooltip shows it whole. */}
        <Typography component="span" size="mini" className="truncate" title={folder.name}>
          {folder.name}
        </Typography>
      </Typography>
      <Typography
        component="span"
        aria-hidden
        data-cy="folder-tag"
        className="hidden size-5 shrink-0 items-center justify-center rounded-md bg-muted phone:flex"
      >
        <FolderEmoji emoji={folder.emoji} className={EMOJI_IN_CHIP} />
      </Typography>
    </>
  );
}

/**
 * A link's folder in a list row or grid card: its emoji as a small badge on
 * the favicon's bottom-end corner, on a disc of the surface behind it (so it
 * reads as cut out of the favicon, not stacked on it). Takes no space, so a
 * row or card reads exactly as with tags off. Decorative: the name is in
 * `FolderTagLabel` (and a row's hover preview).
 *
 * A row's disc is the row's color (`--row-bg`, set by `LinkItem`: the page,
 * or its tint while hovered or its menu is open), its favicon 20px (24px on
 * phones). A
 * card's is the card, its favicon 16px, so the badge is a size smaller.
 *
 * Sized optically: Chromium draws Apple Color Emoji at ~0.9em, WebKit at
 * ~1.1em (see `EMOJI_IN_CHIP`), so WebKit gets a smaller size to draw the
 * same ~9px (11px on phones' row favicon, ~7px on a card's).
 */
export function FolderBadge({
  folder,
  inCard = false,
  arrive = false,
}: {
  folder: FolderSummary;
  inCard?: boolean;
  /** Play the icon arrival (`useFolderBadgeArrival`); only on mount. */
  arrive?: boolean;
}) {
  return (
    <span
      aria-hidden
      data-cy="folder-badge"
      className={cn(
        "pointer-events-none absolute flex items-center justify-center rounded-full",
        inCard
          ? "-end-1 -bottom-1 size-3 bg-card"
          : "-end-1.5 -bottom-1.5 size-3.5 bg-(--row-bg,var(--color-background)) max-md:size-4",
        arrive && ARRIVE_ICON,
      )}
    >
      <FolderEmoji
        emoji={folder.emoji}
        className={cn(
          "size-auto",
          inCard
            ? "text-[8px] supports-[font:-apple-system-body]:text-[6.5px]"
            : "text-[10px] supports-[font:-apple-system-body]:text-[8px] max-md:text-xs max-md:supports-[font:-apple-system-body]:text-[10px]",
        )}
      />
    </span>
  );
}

/**
 * The badge's folder name, for screen readers ("In Reading list"); the
 * row's link points `aria-describedby` at it, so it's read with the link
 * (after the link's description, as a sentence of its own).
 */
export function FolderTagLabel({
  id,
  folder,
}: {
  id: string;
  folder: FolderSummary;
}) {
  return (
    <span id={id} className="sr-only">
      In {folder.name}
    </span>
  );
}

/**
 * Beside a link's `⋯` (rows and cards, shown with it): its folder's emoji,
 * a link to that folder's page, the quick way there from Home. Pointers
 * that hover only: on touch the `⋯` is always shown, and a second button on
 * every filed row would be the clutter the badge replaced. A real link,
 * so Cmd/Ctrl-click opens it in a new tab. Named and tooltipped "Go to …",
 * which says the folder's name the badge doesn't.
 *
 * Its hit area grows 6px up, down and toward the start like the `⋯`'s, but
 * only 2px toward it: in a row the `⋯`'s own 6px takes the rest of the 8px
 * gap, so the two never overlap. On a card's corner the two touch (no gap),
 * so it sits above the `⋯` (`z-[1]`): its own 32px stays its own, and only
 * the `⋯`'s outside extension is covered.
 *
 * The tooltip closes when the pointer leaves the button
 * (`disableHoverableContent`): it's portaled outside the row, so hovering
 * it left the row, which hid the button and left the tooltip pointing at
 * nothing. It only repeats the button's name, so there's nothing in it to
 * hover over.
 */
export function FolderLinkButton({ folder }: { folder: FolderSummary }) {
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="relative z-[1] after:absolute after:-inset-y-1.5 after:-start-1.5 after:-end-0.5 [@media(hover:none)]:hidden"
        >
          <NextLink
            href={`/folders/${folder.slug}`}
            aria-label={`Go to ${folder.name}`}
            data-cy="folder-link"
          >
            <FolderEmoji emoji={folder.emoji} />
          </NextLink>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        Go to {folder.name}
      </TooltipContent>
    </Tooltip>
  );
}
