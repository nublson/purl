"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLinkView } from "@/contexts/link-view-context";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Tag5, Video } from "reicon-react";
import { HapticTarget } from "./haptic-target";
import { DropdownMenuCheckboxItem } from "./ui/dropdown-menu";

/**
 * "Folder tags" in the user menu's Layout group: whether Home tags each
 * link with its folder. A checkbox item (announced as on / off) drawn
 * with a switch; the menu stays open, so the list can be seen changing.
 */
export function FolderTagsMenuItem() {
  const { folderTags, setFolderTags } = useLinkView();
  const isDemo = useIsDemo();
  return (
    <DropdownMenuCheckboxItem
      checked={folderTags}
      disabled={isDemo}
      data-cy="folder-tags-toggle"
      // The switch is the indicator: no check mark, no room kept for one.
      className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(checked) => {
        haptic("selection");
        setFolderTags(checked === true);
      }}
    >
      <Tag5 />
      Folder tags
      <SwitchIndicator on={folderTags} />
      <HapticTarget />
    </DropdownMenuCheckboxItem>
  );
}

/**
 * "Play videos" in the user menu's Layout group: whether video pearls play
 * (muted, looping) in the grid while in view. Off, they stay on their
 * poster and play only while hovered, as under reduced motion; it is the
 * pause control WCAG 2.2.2 asks for on moving content that starts by
 * itself. A checkbox item drawn with a switch, like Folder tags.
 */
export function PlayVideosMenuItem() {
  const { playVideos, setPlayVideos } = useLinkView();
  const isDemo = useIsDemo();
  return (
    <DropdownMenuCheckboxItem
      checked={playVideos}
      disabled={isDemo}
      data-cy="play-videos-toggle"
      className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(checked) => {
        haptic("selection");
        setPlayVideos(checked === true);
      }}
    >
      <Video />
      Play videos
      <SwitchIndicator on={playVideos} />
      <HapticTarget />
    </DropdownMenuCheckboxItem>
  );
}

/**
 * The switch's look (ui/switch) without its button: the menu item is the
 * control, and a button can't sit inside it.
 */
function SwitchIndicator({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      data-state={on ? "checked" : "unchecked"}
      className={cn(
        "ms-auto inline-flex h-[18.4px] w-[32px] shrink-0 items-center rounded-full border border-transparent shadow-xs transition-[background-color] duration-150 ease-out-strong",
        on ? "bg-primary" : "bg-input dark:bg-input/80",
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full transition-transform duration-150 ease-out-strong motion-reduce:transition-none",
          on
            ? "translate-x-[calc(100%-2px)] bg-background dark:bg-primary-foreground"
            : "translate-x-0 bg-background dark:bg-foreground",
        )}
      />
    </span>
  );
}
