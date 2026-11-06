"use client";

import * as React from "react";
import {
  LEGACY_SHARED_VIEW_COOKIE,
  SHARED_VIEWS_COOKIE,
  withVisitorView,
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
}>({ view: "grid", switched: false, setView: () => {} });

/** The current value of one cookie in `document.cookie`, if set. */
function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/**
 * The shared folder page's view (list or grid): set by the header's toggle,
 * read by the list. Wraps both. `initialView` is the visitor's remembered
 * choice for this folder, else the owner's (`ownerView`); switching saves
 * the choice for this folder in the cookie (`withVisitorView`).
 */
export function SharedFolderViewProvider({
  folderId,
  ownerView,
  initialView,
  children,
}: {
  folderId: string;
  ownerView: SharedFolderView;
  initialView: SharedFolderView;
  children: React.ReactNode;
}) {
  const [view, setViewState] = React.useState(initialView);
  const [switched, setSwitched] = React.useState(false);
  const setView = React.useCallback(
    (next: SharedFolderView) => {
      setViewState(next);
      setSwitched(true);
      const value = withVisitorView(
        readCookie(SHARED_VIEWS_COOKIE),
        folderId,
        next,
        ownerView,
      );
      const maxAge = value ? VIEW_COOKIE_MAX_AGE : 0;
      document.cookie = `${SHARED_VIEWS_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
      document.cookie = `${LEGACY_SHARED_VIEW_COOKIE}=; path=/; max-age=0; samesite=lax`;
    },
    [folderId, ownerView],
  );
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
