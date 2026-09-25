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
