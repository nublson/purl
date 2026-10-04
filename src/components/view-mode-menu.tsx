"use client";

import { useLinkView } from "@/contexts/link-view-context";
import { useIsPhone } from "@/hooks/use-is-phone";
import { parseLinkView } from "@/lib/link-view";
import { cn } from "@/lib/utils";
import { ChevronDown, LayoutGrid, List } from "lucide-react";
import * as React from "react";
import {
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
              "ms-auto transition-transform duration-150 ease-out-strong motion-reduce:transition-none",
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
