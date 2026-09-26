"use client";

import { useCallback, useEffect } from "react";
import { SAVE_URL_EVENT, saveLink } from "@/lib/save-link";

export function PasteHandler({
  onPasteStart,
  onSaveSuccess,
  onSaveError,
}: {
  onPasteStart?: (url: string) => void;
  onSaveSuccess?: (newLinkId: string) => void;
  onSaveError?: (detail: { limit?: boolean; message?: string } | null) => void;
}) {
  const save = useCallback(
    async (text: string) => {
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
      await save(text);
    },
    [save],
  );

  // The header "Paste link" menu item reads the clipboard and sends it here.
  const handleSaveRequest = useCallback(
    (e: Event) => {
      const text = (e as CustomEvent<string>).detail?.trim();
      if (!text) return;
      e.preventDefault();
      void save(text);
    },
    [save],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    window.addEventListener(SAVE_URL_EVENT, handleSaveRequest);
    return () => {
      document.removeEventListener("paste", handlePaste);
      window.removeEventListener(SAVE_URL_EVENT, handleSaveRequest);
    };
  }, [handlePaste, handleSaveRequest]);

  return null;
}
