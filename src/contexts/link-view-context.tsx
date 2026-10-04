"use client";

import type { LayoutPrefs, LinkView } from "@/lib/link-view";
import * as React from "react";
import { toast } from "sonner";

type LinkViewContextValue = {
  view: LinkView;
  /** Switches at once, then saves on the account; switches back if that fails. */
  setView: (view: LinkView) => void;
  /** True after a switch in this page (not on load): the new layout fades in. */
  switched: boolean;
  /** Whether Home tags each link with its folder. */
  folderTags: boolean;
  /** Turns folder tags on or off at once, then saves; reverts if that fails. */
  setFolderTags: (on: boolean) => void;
};

const LinkViewContext = React.createContext<LinkViewContextValue | null>(null);

/** Saves a layout change on the account; throws when it didn't save. */
async function saveLayout(change: Partial<LayoutPrefs>) {
  const res = await fetch("/api/user/layout", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!res.ok) throw new Error(`Failed to save the layout (${res.status})`);
}

/**
 * The owner's layout settings (the view, rows or a grid of cards, and
 * Home's folder tags), seeded by the server from the account so the page
 * renders with them, no flash.
 */
export function LinkViewProvider({
  initialLayout,
  children,
}: {
  initialLayout: LayoutPrefs;
  children: React.ReactNode;
}) {
  const [view, setViewState] = React.useState(initialLayout.view);
  const [folderTags, setFolderTagsState] = React.useState(
    initialLayout.folderTags,
  );
  const [switched, setSwitched] = React.useState(false);
  // The last value asked for: a slow failure must not undo a newer choice.
  const latestView = React.useRef(initialLayout.view);
  const latestTags = React.useRef(initialLayout.folderTags);

  const setView = React.useCallback((next: LinkView) => {
    const previous = latestView.current;
    if (next === previous) return;
    latestView.current = next;
    setViewState(next);
    setSwitched(true);
    saveLayout({ view: next }).catch(() => {
      if (latestView.current !== next) return;
      latestView.current = previous;
      setViewState(previous);
      toast.error("Unable to change the view. Try again.");
    });
  }, []);

  const setFolderTags = React.useCallback((next: boolean) => {
    const previous = latestTags.current;
    if (next === previous) return;
    latestTags.current = next;
    setFolderTagsState(next);
    saveLayout({ folderTags: next }).catch(() => {
      if (latestTags.current !== next) return;
      latestTags.current = previous;
      setFolderTagsState(previous);
      toast.error(
        next
          ? "Unable to show folder tags. Try again."
          : "Unable to hide folder tags. Try again.",
      );
    });
  }, []);

  const value = React.useMemo(
    () => ({ view, setView, switched, folderTags, setFolderTags }),
    [view, setView, switched, folderTags, setFolderTags],
  );
  return (
    <LinkViewContext.Provider value={value}>{children}</LinkViewContext.Provider>
  );
}

export function useLinkView(): LinkViewContextValue {
  const value = React.useContext(LinkViewContext);
  if (!value) throw new Error("useLinkView needs a LinkViewProvider");
  return value;
}
