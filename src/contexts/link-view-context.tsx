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
 * One layout setting, shown at once and saved in the background. Saves go
 * one at a time, always the latest choice: a quick back-and-forth can't
 * leave an older value on the account (two requests landing out of
 * order). A failed save goes back to what the account last confirmed.
 */
function useSavedSetting<K extends keyof LayoutPrefs>(
  key: K,
  initial: LayoutPrefs[K],
  failMessage: (value: LayoutPrefs[K]) => string,
  persist: boolean,
) {
  const [value, setValue] = React.useState(initial);
  const latest = React.useRef(initial);
  const confirmed = React.useRef(initial);
  const saving = React.useRef(false);

  const flush = React.useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (latest.current !== confirmed.current) {
        const target = latest.current;
        try {
          await saveLayout({ [key]: target } as Partial<LayoutPrefs>);
          confirmed.current = target;
        } catch {
          // Back to what the account has; say which change didn't stick.
          latest.current = confirmed.current;
          setValue(confirmed.current);
          toast.error(failMessage(target));
          return;
        }
      }
    } finally {
      saving.current = false;
    }
  }, [key, failMessage]);

  const set = React.useCallback(
    (next: LayoutPrefs[K]) => {
      if (next === latest.current) return false;
      latest.current = next;
      setValue(next);
      if (persist) void flush();
      return true;
    },
    [flush, persist],
  );

  return [value, set] as const;
}

const viewFailed = () => "Unable to change the view. Try again.";
const tagsFailed = (on: boolean) =>
  on
    ? "Unable to show folder tags. Try again."
    : "Unable to hide folder tags. Try again.";

/**
 * The owner's layout settings (the view, rows or a grid of cards, and
 * Home's folder tags), seeded by the server from the account so the page
 * renders with them, no flash.
 */
export function LinkViewProvider({
  initialLayout,
  persist = true,
  children,
}: {
  initialLayout: LayoutPrefs;
  /** False (the landing demo): changes show at once and are never saved. */
  persist?: boolean;
  children: React.ReactNode;
}) {
  const [view, saveView] = useSavedSetting("view", initialLayout.view, viewFailed, persist);
  const [folderTags, setFolderTags] = useSavedSetting(
    "folderTags",
    initialLayout.folderTags,
    tagsFailed,
    persist,
  );
  const [switched, setSwitched] = React.useState(false);

  const setView = React.useCallback(
    (next: LinkView) => {
      if (saveView(next)) setSwitched(true);
    },
    [saveView],
  );

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
