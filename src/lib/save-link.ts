"use client";

import { isValidUrl } from "@/utils/url";
import { toast } from "sonner";

export type SaveLinkResult =
  | { id: string }
  | { error: string; limit?: boolean }
  | null;

export async function saveLink(rawUrl: string): Promise<SaveLinkResult> {
  const url = rawUrl.trim();

  if (!isValidUrl(url)) {
    toast.error("Not a valid URL");
    return null;
  }

  try {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      const msg = data?.error ?? "Failed to save link";
      toast.error(msg);
      const hitLimit = res.status === 402 || data?.code === "LIMIT_REACHED";
      return hitLimit ? { error: msg, limit: true } : { error: msg };
    }

    const id = data?.id as string | undefined;
    if (!id) {
      toast.error("Failed to save link");
      return { error: "Invalid response" };
    }
    return { id };
  } catch {
    toast.error("Failed to save link");
    return { error: "Network error" };
  }
}
