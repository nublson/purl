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
  onSaveError?: (detail: { limit?: boolean; message?: string } | null) => void;
}) {
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;

      if (isInputTarget) return;

      const text = e.clipboardData?.getData("text")?.trim();
      if (!text) return;

      e.preventDefault();
      onPasteStart?.(text);

      const result = await saveLink(text);
      if (!result || !("id" in result)) {
        onSaveError?.(
          result && "error" in result
            ? { limit: result.limit, message: result.error }
            : null,
        );
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
