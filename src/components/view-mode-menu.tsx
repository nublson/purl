"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useIsPhone } from "@/hooks/use-is-phone";
import { parseLinkView } from "@/lib/link-view";
import { cn } from "@/lib/utils";
import { ChevronDown, LayoutGrid, List, Tag } from "lucide-react";
import * as React from "react";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./ui/dropdown-menu";

/**
 * "View mode" in the user menu: how Home and folders show links (List or
 * Grid, the current one checked), saved on the account. Its icon is the
 * current view's. A submenu; on phones, where a side menu doesn't fit, the
 * choices open in place under it (like the row menu's "Move to folder").
 */
export function ViewModeMenu() {
  const { view, setView } = useLinkView();
  const isPhone = useIsPhone();
  const [expanded, setExpanded] = React.useState(false);
  const Icon = view === "grid" ? LayoutGrid : List;

  const choices = (
    <DropdownMenuRadioGroup
      value={view}
      onValueChange={(value) => {
        const next = parseLinkView(value);
        if (next) setView(next);
      }}
    >
      <DropdownMenuRadioItem value="list" data-cy="link-view-list">
        <List />
        List
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="grid" data-cy="link-view-grid">
        <LayoutGrid />
        Grid
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );

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
          <Icon />
          View mode
          <ChevronDown
            aria-hidden="true"
            className={cn(
              // -me-0.5: the chevron's ink ends ~3px inside its box;
              // pulled into the padding, its right edge mirrors the
              // leading icon's left.
              "ms-auto -me-0.5 transition-transform duration-150 ease-out-strong motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </DropdownMenuItem>
        {/* Same entrance as the row menu's folders. The Layout group's
            separator follows, so none here. */}
        {expanded ? (
          <div className="transition-[opacity,translate] duration-150 ease-out-strong starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0">
            {choices}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon />
        View mode
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-36">{choices}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * "Folder tags" in the user menu's Layout group: whether Home tags each
 * link with its folder. A checkbox item (announced as on / off) drawn
 * with a switch; the menu stays open, so the list can be seen changing.
 */
export function FolderTagsMenuItem() {
  const { folderTags, setFolderTags } = useLinkView();
  return (
    <DropdownMenuCheckboxItem
      checked={folderTags}
      data-cy="folder-tags-toggle"
      // The switch is the indicator: no check mark, no room kept for one.
      className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={(checked) => setFolderTags(checked === true)}
    >
      <Tag />
      Folder tags
      <SwitchIndicator on={folderTags} />
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
