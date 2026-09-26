"use client";

import { linksOriginHeaders } from "@/lib/links-origin";
import { isValidUrl } from "@/utils/url";
import { toast } from "sonner";

export type SaveLinkResult =
  | { id: string }
  | { error: string; limit?: boolean }
  | null;

export async function saveLink(rawUrl: string): Promise<SaveLinkResult> {
  const url = rawUrl.trim();

  if (!isValidUrl(url)) {
    toast.error("Enter a full URL, like https://example.com.");
    return null;
  }

  try {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...linksOriginHeaders },
      body: JSON.stringify({ url }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      const msg = data?.error ?? "Unable to save the link. Try again.";
      toast.error(msg);
      const hitLimit = data?.code === "LIMIT_REACHED";
      return hitLimit ? { error: msg, limit: true } : { error: msg };
    }

    const id = data?.id as string | undefined;
    if (!id) {
      toast.error("Unable to save the link. Try again.");
      return { error: "Invalid response" };
    }
    return { id };
  } catch {
    toast.error("Unable to save the link. Check your connection and try again.");
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
