"use client";

import type { LinkView } from "@/lib/link-view";
import * as React from "react";
import { toast } from "sonner";

type LinkViewContextValue = {
  view: LinkView;
  /** Switches at once, then saves on the account; switches back if that fails. */
  setView: (view: LinkView) => void;
  /** True after a switch in this page (not on load): the new layout fades in. */
  switched: boolean;
};

const LinkViewContext = React.createContext<LinkViewContextValue | null>(null);

/**
 * The owner's list view (rows or a grid of cards), seeded by the server
 * from the account so the page renders in it, no flash.
 */
export function LinkViewProvider({
  initialView,
  children,
}: {
  initialView: LinkView;
  children: React.ReactNode;
}) {
  const [view, setViewState] = React.useState(initialView);
  const [switched, setSwitched] = React.useState(false);
  // The last view asked for: a slow failure must not undo a newer choice.
  const latest = React.useRef(initialView);

  const setView = React.useCallback((next: LinkView) => {
    const previous = latest.current;
    if (next === previous) return;
    latest.current = next;
    setViewState(next);
    setSwitched(true);
    void fetch("/api/user/link-view", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to save the view (${res.status})`);
      })
      .catch(() => {
        if (latest.current !== next) return;
        latest.current = previous;
        setViewState(previous);
        toast.error("Unable to change the view. Try again.");
      });
  }, []);

  const value = React.useMemo(
    () => ({ view, setView, switched }),
    [view, setView, switched],
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
