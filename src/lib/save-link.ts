"use client";

import { linksOriginHeaders } from "@/lib/links-origin";
import { formatFolderLabel } from "@/lib/folder-display";
import { cancelPendingLinkDelete } from "@/lib/pending-link-deletes";
import { isValidUrl } from "@/utils/url";
import { toast } from "sonner";

export type SaveLinkResult =
  | { id: string }
  | { error: string; limit?: boolean }
  | null;

/** Folder to file a save into: `useCurrentFolder()` on a folder page, or omitted on /home. */
export type SaveLinkFolder = { id: string; name: string; emoji: string };

export async function saveLink(
  rawUrl: string,
  /** `quiet` skips every toast: a multi-link paste reports once, at the end. */
  opts?: { folder?: SaveLinkFolder; quiet?: boolean },
): Promise<SaveLinkResult> {
  const url = rawUrl.trim();
  const say = opts?.quiet ? null : toast;

  if (!isValidUrl(url)) {
    say?.error("Enter a full URL, like https://example.com.");
    return null;
  }

  const folder = opts?.folder;

  try {
    const body: { url: string; folderId?: string } = { url };
    if (folder) body.folderId = folder.id;

    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...linksOriginHeaders },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      code?: string;
      moved?: boolean;
    };
    if (!res.ok) {
      // The API's message is machine-facing (plain apostrophes, matched
      // by integrations); curl them only for display.
      const msg = data?.error
        ? data.error.replace(/(\w)'(\w)/g, "$1’$2")
        : "Unable to save the link. Try again.";
      say?.error(msg);
      const hitLimit = data?.code === "LIMIT_REACHED";
      return hitLimit ? { error: msg, limit: true } : { error: msg };
    }

    const id = data?.id as string | undefined;
    if (!id) {
      say?.error("Unable to save the link. Try again.");
      return { error: "Invalid response" };
    }

    // Saving a link that's mid-delete (Undo window) returns its same id:
    // treat the save as an Undo so it isn't hidden and then deleted.
    cancelPendingLinkDelete(id);

    if (folder) {
      const label = formatFolderLabel(folder);
      say?.success(data.moved ? `Moved to ${label}` : `Saved to ${label}`);
    }

    return { id };
  } catch {
    say?.error("Unable to save the link. Check your connection and try again.");
    return { error: "Network error" };
  }
}

/** DOM event the header "Paste link" action uses to hand a URL to /home. */
export const SAVE_URL_EVENT = "purl:save-url";

/**
 * Asks the mounted page to save `url` through its paste flow (optimistic row,
 * list refresh). Returns false when no page handled it, so the caller can
 * save directly instead.
 */
export function requestSaveUrl(url: string): boolean {
  const event = new CustomEvent<string>(SAVE_URL_EVENT, {
    detail: url,
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}
