"use client";

import type { FolderSummary } from "@/hooks/use-folders";
import {
  addLinksPopover,
  useAddLinksPopoverAnchor,
  type AddLinksAnchor,
} from "@/lib/add-links-popover";
import { formatFolderLabel } from "@/lib/folder-display";
import dynamic from "next/dynamic";
import * as React from "react";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

// The picker (and cmdk under it) isn't part of the page's first load: it's
// fetched once a popover's anchor is on screen (after hydration), so it's
// ready by the time it opens. The placeholder holds its height otherwise.
const loadPicker = () => import("./add-links-picker");
const AddLinksPicker = dynamic(loadPicker, {
  ssr: false,
  loading: () => <div className="h-72" aria-hidden />,
});

/**
 * "Add links" on a folder page: a popover attached to `children` (its
 * anchor) with a search field and your 10 most recent links that aren't in
 * this folder (searching shows 10 matches). Click (or Enter) checks links,
 * and checks survive a new search; "Add N links" (or ⌘/Ctrl+Enter) moves
 * them all in as one move with one Undo toast, and the list refills.
 * Opens when `addLinksPopover.open(placement)` is called.
 */
export function AddLinksPopover({
  folder,
  placement,
  align = "center",
  children,
}: {
  folder: FolderSummary;
  placement: AddLinksAnchor;
  align?: "start" | "center" | "end";
  children: React.ReactElement;
}) {
  const open = useAddLinksPopoverAnchor() === placement;
  const anchorRef = React.useRef<HTMLDivElement>(null);
  // A failed prefetch is fine: opening the popover loads it again.
  React.useEffect(() => void loadPicker().catch(() => {}), []);

  // Its anchor going away closes it (the store outlives the page), but only
  // if it's open on that anchor: the empty state disappearing must not close
  // the header's picker. Adding the first links from the empty state removes
  // it, so that picker closes too: the job is done.
  React.useEffect(
    () => () => {
      if (addLinksPopover.current() === placement) addLinksPopover.close();
    },
    [placement],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) addLinksPopover.close();
      }}
    >
      <PopoverAnchor asChild ref={anchorRef}>
        {children}
      </PopoverAnchor>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-80 gap-0 p-0"
        aria-label={`Add links to ${formatFolderLabel(folder)}`}
        // It's anchored, not triggered: hand focus back to the anchor.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const anchor = anchorRef.current;
          const target = anchor?.matches("button, a")
            ? anchor
            : anchor?.querySelector<HTMLElement>("button, a");
          target?.focus();
        }}
      >
        <AddLinksPicker folder={folder} />
      </PopoverContent>
    </Popover>
  );
}
