import type { FolderSummary } from "@/lib/folders";

/**
 * A folder as the v1 API and MCP return it: `FolderSummary` without the
 * app-only `view` and `sharedView` (the per-folder list/grid choices aren't
 * part of those shapes yet).
 */
export type ApiFolder = Omit<FolderSummary, "view" | "sharedView">;

export function toApiFolder(folder: FolderSummary): ApiFolder {
  const rest: Partial<FolderSummary> = { ...folder };
  delete rest.view;
  delete rest.sharedView;
  return rest as ApiFolder;
}
