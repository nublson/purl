"use client";

import { useCallback, useEffect } from "react";
import { saveLink } from "@/lib/save-link";

export function PasteHandler({
  onPasteStart,
  onSaveSuccess,
  onSaveError,
}: {
  onPasteStart?: (url: string) => void;
  onSaveSuccess?: (newLinkId: string) => void;
  onSaveError?: () => void;
}) {
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text")?.trim();
      if (!text) return;

      e.preventDefault();
      onPasteStart?.(text);

      const result = await saveLink(text);
      if (!result) {
        onSaveError?.();
        return;
      }

      if (result.id) onSaveSuccess?.(result.id);
    },
    [onPasteStart, onSaveSuccess, onSaveError],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return null;
}
