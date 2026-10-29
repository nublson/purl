"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLinkView } from "@/contexts/link-view-context";
import { haptic } from "@/lib/haptics";
import type { LinkView } from "@/lib/link-view";
import { cn } from "@/lib/utils";
import { Grid, List3, Tag5, Video } from "reicon-react";
import { HapticTarget } from "./haptic-target";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";

const VIEW_OPTIONS = [
  { value: "list", label: "List", Icon: List3 },
  { value: "grid", label: "Grid", Icon: Grid },
] as const;

/**
 * The view (list or grid) in the user menu, under its "View" title: two
 * radio items side by side, each its icon and name, drawn as the menu's
 * own rows (same padding, so List's icon lines up with the icons below);
 * the current one keeps the highlight's fill, the other is muted and
 * fills half as much on hover. How Home and folders show links, saved on
 * the account (`useLinkView`; the landing demo's is local state). The menu
 * stays open, so the list can be seen changing.
 */
export function ViewMenuItems() {
  const { view, setView } = useLinkView();
  return (
    <DropdownMenuRadioGroup
      value={view}
      aria-label="View"
      onValueChange={(value) => {
        haptic("selection");
        setView(value as LinkView);
      }}
      className="grid grid-cols-2 gap-1"
    >
      {VIEW_OPTIONS.map(({ value, label, Icon }) => (
        <DropdownMenuRadioItem
          key={value}
          value={value}
          data-cy={`link-view-${value}`}
          onSelect={(event) => event.preventDefault()}
          // The fill is the indicator: no check mark, no room kept for one.
          // A ring on keyboard focus, like every menu item (ui/dropdown-menu).
          className={cn(
            "relative pr-2 in-data-[input=keyboard]:focus:ring-2 in-data-[input=keyboard]:focus:ring-ring in-data-[input=keyboard]:focus:ring-inset [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden",
            view === value
              ? // An inset ring as well as the fill: the fill alone is ~1.2:1
                // against the menu, the ring ~3.4:1 (a state needs 3:1).
                "bg-accent text-accent-foreground ring-1 ring-foreground/40 ring-inset"
              : "text-muted-foreground focus:bg-accent/50 [&_svg]:text-muted-foreground",
          )}
        >
          <Icon />
          {label}
          <HapticTarget />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

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
export function SwitchIndicator({ on }: { on: boolean }) {
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
