"use client";

import { createContext, useMemo, useState, type ReactNode } from "react";

export interface LinksSyncActions {
  /** Signal that the user's links changed (a save, edit, delete, or remote update). */
  notifyLinksChanged: () => void;
  /** Record the user's current saved-link count after a list reload. */
  setLinksTotal: (total: number) => void;
}

export interface LinksSyncState {
  /** Increments on every `notifyLinksChanged()`; list consumers reload when it changes. */
  version: number;
  /** Latest saved-link count from a list reload; null until the first reload. */
  total: number | null;
}

/**
 * Split in two so components that only trigger changes (rows, menus, dialogs)
 * read the stable actions and never re-render when the state changes.
 */
export const LinksSyncActionsContext = createContext<LinksSyncActions>({
  notifyLinksChanged: () => {},
  setLinksTotal: () => {},
});

export const LinksSyncStateContext = createContext<LinksSyncState>({
  version: 0,
  total: null,
});

export function LinksSyncProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [total, setTotal] = useState<number | null>(null);

  const actions = useMemo<LinksSyncActions>(
    () => ({
      notifyLinksChanged: () => setVersion((v) => v + 1),
      setLinksTotal: setTotal,
    }),
    [],
  );
  const state = useMemo(() => ({ version, total }), [version, total]);

  return (
    <LinksSyncActionsContext.Provider value={actions}>
      <LinksSyncStateContext.Provider value={state}>
        {children}
      </LinksSyncStateContext.Provider>
    </LinksSyncActionsContext.Provider>
  );
}
