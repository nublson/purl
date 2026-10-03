"use client";

import { LayoutGrid, List } from "lucide-react";
import * as React from "react";
import { Button } from "./ui/button";

export type SharedFolderView = "list" | "grid";

const ViewContext = React.createContext<{
  view: SharedFolderView;
  setView: (view: SharedFolderView) => void;
}>({ view: "list", setView: () => {} });

/**
 * The shared folder page's view (list, the default, or grid): set by the
 * header's toggle, read by the list. Wraps both.
 */
export function SharedFolderViewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [view, setView] = React.useState<SharedFolderView>("list");
  const value = React.useMemo(() => ({ view, setView }), [view]);
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
