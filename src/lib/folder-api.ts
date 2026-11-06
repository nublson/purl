import type { FolderSummary } from "@/lib/folders";

/**
 * A folder as the v1 API and MCP return it: `FolderSummary` without the
 * app-only `view` (the per-folder list/grid choice isn't part of those
 * shapes yet).
 */
export type ApiFolder = Omit<FolderSummary, "view">;

export function toApiFolder(folder: FolderSummary): ApiFolder {
  const rest: Partial<FolderSummary> = { ...folder };
  delete rest.view;
  return rest as ApiFolder;
}
