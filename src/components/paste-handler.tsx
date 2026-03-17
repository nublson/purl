"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function PasteHandler({
  onPasteStart,
  onPasteEnd,
}: {
  onPasteStart?: (url: string) => void;
  onPasteEnd?: () => void;
}) {
  const router = useRouter();

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text")?.trim();
      if (!text) return;

      if (!isValidUrl(text)) {
        toast.error("Not a valid URL");
        return;
      }

      e.preventDefault();
      onPasteStart?.(text);

      try {
        const res = await fetch("/api/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: text }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          toast.error(data?.error ?? "Failed to save link");
          return;
        }

        router.refresh();
      } catch {
        toast.error("Failed to save link");
      } finally {
        onPasteEnd?.();
      }
    },
    [router, onPasteStart, onPasteEnd]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return null;
}
