"use client";

import { LayoutGrid, List } from "lucide-react";
import * as React from "react";
import {
  SHARED_FOLDER_VIEW_COOKIE,
  type SharedFolderView,
} from "@/lib/shared-folder-view";
import { Button } from "./ui/button";

/** A year: the choice outlives the visit. */
const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const ViewContext = React.createContext<{
  view: SharedFolderView;
  setView: (view: SharedFolderView) => void;
}>({ view: "list", setView: () => {} });

/**
 * The shared folder page's view (list, the default, or grid): set by the
 * header's toggle, read by the list. Wraps both. `initialView` comes from
 * the visitor's cookie; changing it saves the cookie again.
 */
export function SharedFolderViewProvider({
  initialView,
  children,
}: {
  initialView: SharedFolderView;
  children: React.ReactNode;
}) {
  const [view, setViewState] = React.useState(initialView);
  const setView = React.useCallback((next: SharedFolderView) => {
    setViewState(next);
    document.cookie = `${SHARED_FOLDER_VIEW_COOKIE}=${next}; path=/; max-age=${VIEW_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);
  const value = React.useMemo(() => ({ view, setView }), [view, setView]);
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useSharedFolderView() {
  return React.useContext(ViewContext).view;
}

/** The header's List / Grid buttons: the current view is filled. */
export function SharedFolderViewToggle() {
  const { view, setView } = React.useContext(ViewContext);
  const options = [
    { value: "list", label: "List view", Icon: List },
    { value: "grid", label: "Grid view", Icon: LayoutGrid },
  ] as const;
  return (
    <div role="group" aria-label="View" className="flex shrink-0 items-center gap-1">
      {options.map(({ value, label, Icon }) => {
        const active = view === value;
        return (
          <Button
            key={value}
            variant={active ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={label}
            aria-pressed={active}
            className={active ? "cursor-pointer" : "cursor-pointer text-muted-foreground"}
            onClick={() => setView(value)}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}
