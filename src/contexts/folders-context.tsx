"use client";

import { fetchFolders } from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import { useLinksSyncState } from "@/hooks/use-links-sync";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface FoldersContextValue {
  folders: FolderSummary[];
  isLoading: boolean;
  /** Re-fetches immediately, without waiting for the next links-sync version bump. */
  refresh: () => void;
}

const FoldersContext = createContext<FoldersContextValue>({
  folders: [],
  isLoading: true,
  refresh: () => {},
});

/**
 * Single source of truth for the signed-in user's folders. Fetches once on
 * mount and again whenever the links-sync `version` changes (a save, edit,
 * delete, or remote update can change folder link counts). Consumers read
 * through `useFolders`/`useCurrentFolder`; actions call `refresh()` after a
 * mutation so the list updates immediately instead of waiting on the next
 * links-sync bump.
 */
export function FoldersProvider({ children }: { children: ReactNode }) {
  const { version } = useLinksSyncState();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Only the initial mount shows a loading state; a version bump or an
    // action's refresh() re-fetches silently in the background, the same
    // pattern HomeShell's own `reload()` follows.
    fetchFolders()
      .then((data) => {
        if (!cancelled) setFolders(data);
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
  }, [version, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  const value = useMemo<FoldersContextValue>(
    () => ({ folders, isLoading, refresh }),
    [folders, isLoading, refresh],
  );

  return (
    <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>
  );
}

export function useFoldersContext(): FoldersContextValue {
  return useContext(FoldersContext);
}
