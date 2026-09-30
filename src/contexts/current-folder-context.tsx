"use client";

import type { FolderSummary } from "@/lib/folders";
import { createContext, useContext, type ReactNode } from "react";

const CurrentFolderContext = createContext<FolderSummary | null>(null);

/**
 * Provides the folder a `/folders/[slug]` page resolved server-side to its
 * client subtree. `useCurrentFolder()` prefers this over matching the URL slug
 * against the client folder list, so saves on a folder page always file into
 * the page's folder by **id** — even after the folder was renamed (slug
 * changed) or deleted in another tab and the refetched list no longer holds
 * the URL's slug.
 */
export function CurrentFolderProvider({
  folder,
  children,
}: {
  folder: FolderSummary;
  children: ReactNode;
}) {
  return (
    <CurrentFolderContext.Provider value={folder}>
      {children}
    </CurrentFolderContext.Provider>
  );
}

/** The folder page's server-resolved folder, or null outside a `CurrentFolderProvider`. */
export function useCurrentFolderContext(): FolderSummary | null {
  return useContext(CurrentFolderContext);
}
