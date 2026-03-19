"use client";

import { isValidUrl } from "@/utils/url";
import { toast } from "sonner";

type SaveLinkResult = {
  id?: string;
};

export async function saveLink(rawUrl: string): Promise<SaveLinkResult | null> {
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

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to save link");
      return null;
    }

    return { id: data?.id };
  } catch {
    toast.error("Failed to save link");
    return null;
  }
}
