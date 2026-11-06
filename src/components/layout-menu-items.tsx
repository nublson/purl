"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLinkView } from "@/contexts/link-view-context";
import { haptic } from "@/lib/haptics";
import type { LinkView } from "@/lib/link-view";
import { cn } from "@/lib/utils";
import * as React from "react";
import { Eye, Grid, List3, Tag5, Video } from "reicon-react";
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
 * "Default view", the first row of the user menu's Layout group, drawn like
 * the Share popover's row: its icon and label on the left, and on the right the List / Grid pair as one outlined
 * segmented control (`ViewToggle`'s look), the current one filled. The two
 * are the menu's own radio items (icon-only, named "List" / "Grid"), so the
 * arrow keys reach them like any item. Home's view on Home (the account's,
 * also every folder's that has none of its own), the current folder's on a
 * folder page (`useLinkView`; the landing demo's is local state). The menu
 * stays open, so the list can be seen changing.
 */
export function ViewMenuItems() {
  const { view, setView } = useLinkView();
  const labelId = React.useId();
  return (
    <div className="flex items-center gap-2 py-1 ps-2 pe-1 text-sm">
      <Eye aria-hidden className="size-4 shrink-0" />
      <span id={labelId} className="flex-1">
        Default view
      </span>
      <DropdownMenuRadioGroup
        value={view}
        aria-labelledby={labelId}
        onValueChange={(value) => {
          haptic("selection");
          setView(value as LinkView);
        }}
        className="flex shrink-0 items-center gap-0.5 rounded-[10px] border border-border p-0.5"
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
              "relative size-[26px] justify-center rounded-[7px] p-0 in-data-[input=keyboard]:focus:ring-2 in-data-[input=keyboard]:focus:ring-ring in-data-[input=keyboard]:focus:ring-inset [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden",
              view === value
                ? "bg-secondary text-secondary-foreground focus:bg-secondary"
                : "text-muted-foreground focus:bg-accent/50 [&_svg]:text-muted-foreground",
            )}
          >
            <Icon aria-hidden />
            <span className="sr-only">{label}</span>
            <HapticTarget />
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
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
export function SwitchIndicator({ on, busy = false }: { on: boolean; busy?: boolean }) {
  return (
    <span
      aria-hidden
      data-state={on ? "checked" : "unchecked"}
      data-busy={busy || undefined}
      className={cn(
        "ms-auto inline-flex h-[18.4px] w-[32px] shrink-0 items-center rounded-full border border-transparent shadow-xs transition-[background-color,opacity] duration-150 ease-out-strong",
        on ? "bg-primary" : "bg-input dark:bg-input/80",
        busy && "opacity-50",
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
