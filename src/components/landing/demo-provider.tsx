"use client";

import { CurrentFolderProvider } from "@/contexts/current-folder-context";
import { CurrentUserProvider } from "@/contexts/current-user-context";
import { DemoModeContext } from "@/contexts/demo-mode-context";
import { FoldersProvider } from "@/contexts/folders-context";
import { LinkViewProvider } from "@/contexts/link-view-context";
import type { DemoData } from "@/lib/demo-links";
import type { FolderSummary } from "@/lib/folders";
import type { SessionUser } from "@/lib/session";
import { useMemo, useState, type ReactNode } from "react";

const DEMO_LAYOUT = { view: "list", folderTags: false } as const;

/**
 * The app's real providers filled with demo data and local state. No
 * `LinksSyncProvider`: its default context is a no-op with a version that
 * never changes, so `FoldersProvider` never refetches `/api/folders`.
 */
export function DemoProvider({
  data,
  children,
}: {
  data: DemoData;
  children: ReactNode;
}) {
  const folders = useMemo<FolderSummary[]>(
    () =>
      data.folders.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        emoji: f.emoji,
        description: f.description,
        isPublic: true,
        linkCount: f.links.length,
      })),
    [data.folders],
  );
  const totalLinks = useMemo(
    () => folders.reduce((sum, f) => sum + f.linkCount, 0),
    [folders],
  );
  const user = useMemo<SessionUser>(
    () => ({
      id: "demo",
      name: data.owner.name,
      email: "",
      image: data.owner.image,
      username: data.owner.username,
    }),
    [data.owner],
  );

  const [folderId, setFolderId] = useState(
    () => (folders.find((f) => f.slug === "reading-list") ?? folders[0])?.id,
  );
  const current = folders.find((f) => f.id === folderId) ?? folders[0];
  const mode = useMemo(() => ({ selectFolder: setFolderId }), []);

  if (!current) return null;
  return (
    <DemoModeContext.Provider value={mode}>
      <FoldersProvider
        initialFolders={folders}
        initialTotalLinks={totalLinks}
        offline
      >
        <CurrentFolderProvider folder={current}>
          <CurrentUserProvider user={user}>
            <LinkViewProvider initialLayout={DEMO_LAYOUT} persist={false}>
              {children}
            </LinkViewProvider>
          </CurrentUserProvider>
        </CurrentFolderProvider>
      </FoldersProvider>
    </DemoModeContext.Provider>
  );
}
