"use client";

import * as React from "react";
import {
  SHARED_FOLDER_VIEW_COOKIE,
  type SharedFolderView,
} from "@/lib/shared-folder-view";
import { ViewToggle } from "./view-toggle";

/** A year: the choice outlives the visit. */
const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const ViewContext = React.createContext<{
  view: SharedFolderView;
  /** The visitor has switched views on this page (not just the saved one). */
  switched: boolean;
  setView: (view: SharedFolderView) => void;
}>({ view: "list", switched: false, setView: () => {} });

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
  const [switched, setSwitched] = React.useState(false);
  const setView = React.useCallback((next: SharedFolderView) => {
    setViewState(next);
    setSwitched(true);
    document.cookie = `${SHARED_FOLDER_VIEW_COOKIE}=${next}; path=/; max-age=${VIEW_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);
  const value = React.useMemo(
    () => ({ view, switched, setView }),
    [view, switched, setView],
  );
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useSharedFolderView() {
  const { view, switched } = React.useContext(ViewContext);
  return { view, switched };
}

/** The header's List / Grid buttons (`ViewToggle`), for this page's view. */
export function SharedFolderViewToggle() {
  const { view, setView } = React.useContext(ViewContext);
  return <ViewToggle view={view} onChange={setView} />;
}
