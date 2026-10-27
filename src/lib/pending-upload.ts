/**
 * A file on its way to becoming a pearl, as the page shows it: a pending
 * card (grid) or row (list) at the top of "Today", with its local preview
 * and how far its upload is. Failed items stay, with Retry and Dismiss.
 */
export type PendingUpload = {
  id: string;
  /** The file's own name, as the user knows it. */
  name: string;
  kind: "image" | "video" | "audio";
  /** A local object URL to show meanwhile; null shows the kind's icon. */
  previewUrl: string | null;
  /** 0–100. */
  progress: number;
  status: "uploading" | "failed";
  width: number | null;
  height: number | null;
};

/** Adds `item` at the end; an item with its id (a retry) is replaced in place. */
export function addPending(
  list: PendingUpload[],
  item: PendingUpload,
): PendingUpload[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export function updatePending(
  list: PendingUpload[],
  id: string,
  patch: Partial<Omit<PendingUpload, "id">>,
): PendingUpload[] {
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return list;
  const next = [...list];
  next[index] = { ...next[index], ...patch };
  return next;
}

export function removePending(
  list: PendingUpload[],
  id: string,
): PendingUpload[] {
  return list.some((item) => item.id === id)
    ? list.filter((item) => item.id !== id)
    : list;
}

/** Items still uploading (failed ones wait for Retry or Dismiss). */
export function countUploading(list: PendingUpload[]): number {
  return list.filter((item) => item.status === "uploading").length;
}

/** The page's one status line while files upload: "Uploading 3 files". */
export function uploadingStatusText(count: number): string {
  return count === 1 ? "Uploading 1 file" : `Uploading ${count} files`;
}
