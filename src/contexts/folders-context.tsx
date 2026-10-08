"use client";

import { fetchFolders } from "@/lib/folder-client";
import { byPosition } from "@/lib/folder-order";
import type { FolderSummary } from "@/lib/folders";
import { useLinksSyncState } from "@/hooks/use-links-sync";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface FoldersContextValue {
  folders: FolderSummary[];
  isLoading: boolean;
  /**
   * The user's saved-link total from the server render (Home's count);
   * `useFolders` prefers the live links-sync total once a list reload reports one.
   */
  initialTotalLinks: number | null;
  /** Re-fetches immediately, without waiting for the next links-sync version bump. */
  refresh: () => void;
  /** Inserts or replaces a folder locally (create/rename), ahead of the background refetch. */
  upsertFolder: (folder: FolderSummary) => void;
  /** Removes a folder locally (delete), ahead of the background refetch. */
  removeFolderLocally: (id: string) => void;
  /** Replaces the whole list as given (a reorder, or its rollback). */
  replaceFolders: (folders: FolderSummary[]) => void;
  /**
   * Drops background fetch results until the returned release runs (a save
   * in flight), so a fetch that read the old order can't land over the new
   * one. Releasing also drops fetches that started during the hold.
   */
  holdFetches: () => () => void;
}

const FoldersContext = createContext<FoldersContextValue>({
  folders: [],
  isLoading: true,
  initialTotalLinks: null,
  refresh: () => {},
  upsertFolder: () => {},
  removeFolderLocally: () => {},
  replaceFolders: () => {},
  holdFetches: () => () => {},
});

/**
 * Single source of truth for the signed-in user's folders. Fetches once on
 * mount and again whenever the links-sync `version` changes (a save, edit,
 * delete, or remote update can change folder link counts). Consumers read
 * through `useFolders`/`useCurrentFolder`.
 *
 * `useFolderActions()` doesn't wait for a refetch after create/rename/delete
 * before navigating (e.g. to the new folder's page) — it patches the list
 * locally via `upsertFolder`/`removeFolderLocally` first, so
 * `useCurrentFolder()` resolves correctly on the very next render. A fetch
 * already in flight when a local patch lands is stale by definition (its
 * response predates the mutation), so its result is dropped instead of
 * overwriting the patch; the next version bump or `refresh()` reconciles.
 *
 * `initialFolders` seeds the list from the layout's own server-side lookup
 * (see `(private)/(app)/layout.tsx`) so `useCurrentFolder()` already
 * resolves correctly on the very first render everywhere the provider
 * reaches — including a save made before the client-side refetch below
 * would otherwise have landed. Passing it also starts `isLoading` at
 * `false` instead of `true`.
 */
export function FoldersProvider({
  children,
  initialFolders,
  initialTotalLinks = null,
  offline = false,
}: {
  children: ReactNode;
  initialFolders?: FolderSummary[];
  initialTotalLinks?: number | null;
  /** Never fetch (mount, version bump or `refresh()`): the landing demo's
   * folders are its own data, not the account's. */
  offline?: boolean;
}) {
  const { version } = useLinksSyncState();
  const [folders, setFolders] = useState<FolderSummary[]>(
    initialFolders ?? [],
  );
  const [isLoading, setIsLoading] = useState(!initialFolders);
  const [refreshToken, setRefreshToken] = useState(0);
  const mutationCountRef = useRef(0);
  const heldRef = useRef(0);
  // True once the effect below has run once while seeded. Lets the very
  // first (mount) run skip its fetch when server-seeded data is already
  // fresh, while any later run — a version bump or refresh() — still
  // fetches normally.
  const skippedSeededMountRef = useRef(false);

  useEffect(() => {
    if (offline) return;
    if (initialFolders !== undefined && !skippedSeededMountRef.current) {
      skippedSeededMountRef.current = true;
      return;
    }
    let cancelled = false;
    const mutationCountAtStart = mutationCountRef.current;
    // Only the initial (unseeded) mount shows a loading state; a version
    // bump or refresh() re-fetches silently in the background, the same
    // pattern HomeShell's own `reload()` follows.
    fetchFolders()
      .then((data) => {
        if (cancelled) return;
        if (mutationCountRef.current !== mutationCountAtStart) return;
        if (heldRef.current > 0) return;
        setFolders(data);
      })
      .catch(() => {
        // Keep the previous list; the next version bump or refresh() retries.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `initialFolders` is intentionally omitted: it only matters for the
    // one-time skip check above, keyed off `skippedSeededMountRef` rather
    // than the value itself, so reacting to it here would refetch on a
    // parent re-render that happens to pass a new (but equivalent) array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  const upsertFolder = useCallback((folder: FolderSummary) => {
    mutationCountRef.current += 1;
    setFolders((current) => {
      const idx = current.findIndex((f) => f.id === folder.id);
      if (idx === -1) return [...current, folder].sort(byPosition);
      const next = [...current];
      next[idx] = folder;
      return next.sort(byPosition);
    });
  }, []);

  const removeFolderLocally = useCallback((id: string) => {
    mutationCountRef.current += 1;
    setFolders((current) => current.filter((f) => f.id !== id));
  }, []);

  const replaceFolders = useCallback((next: FolderSummary[]) => {
    mutationCountRef.current += 1;
    setFolders(next);
  }, []);

  const holdFetches = useCallback(() => {
    heldRef.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      heldRef.current -= 1;
      mutationCountRef.current += 1;
      // Fetches dropped meanwhile may have carried other changes (counts, a
      // folder added in another tab): fetch again once nothing is held.
      if (heldRef.current === 0) refresh();
    };
  }, [refresh]);

  const value = useMemo<FoldersContextValue>(
    () => ({
      folders,
      isLoading,
      initialTotalLinks,
      refresh,
      upsertFolder,
      removeFolderLocally,
      replaceFolders,
      holdFetches,
    }),
    [
      folders,
      isLoading,
      initialTotalLinks,
      refresh,
      upsertFolder,
      removeFolderLocally,
      replaceFolders,
      holdFetches,
    ],
  );

  return (
    <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>
  );
}

export function useFoldersContext(): FoldersContextValue {
  return useContext(FoldersContext);
}
