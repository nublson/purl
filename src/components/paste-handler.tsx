"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { useCurrentFolder } from "@/hooks/use-folders";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { MAX_PASTED_URLS } from "@/lib/limits";
import { parsePastedUrls, type PastedUrls } from "@/lib/pasted-urls";
import type { PendingSave } from "@/lib/pending-save";
import { SAVE_URL_EVENT, saveLink } from "@/lib/save-link";
import { batchSummary, saveLinks } from "@/lib/save-links";
import { requestUploadFiles } from "@/lib/save-uploads";
import { NO_UPLOAD_PAGE_MESSAGE } from "@/lib/upload-picker";

export function PasteHandler({
  onPasteStart,
  onSaveSuccess,
  onSaveError,
  onBatchDone,
}: {
  onPasteStart?: (url: string, progress?: PendingSave["progress"]) => void;
  /**
   * `quiet`: one link of a multi-link paste; the batch toasts once, at the
   * end. `last`: the batch's final link, whose landing is where its
   * indicator leaves.
   */
  onSaveSuccess?: (
    newLinkId: string,
    opts?: { quiet?: boolean; last?: boolean },
  ) => void | Promise<void>;
  onSaveError?: (detail: { limit?: boolean; message?: string } | null) => void;
  /** A multi-link paste finished (after its summary toast). */
  onBatchDone?: () => void;
}) {
  const currentFolder = useCurrentFolder();
  const { uploadsEnabled } = useCurrentUser();
  const savingMany = useRef(false);

  const saveMany = useCallback(
    async (pasted: PastedUrls) => {
      if (pasted.tooMany) {
        toast.error(`Paste up to ${MAX_PASTED_URLS} links at a time.`);
        return;
      }
      if (savingMany.current) {
        toast.error("Still saving your last paste. Try again in a moment.");
        return;
      }

      savingMany.current = true;
      const folder = currentFolder
        ? {
            id: currentFolder.id,
            name: currentFolder.name,
            emoji: currentFolder.emoji,
          }
        : undefined;
      try {
        const outcome = await saveLinks(pasted.urls, {
          folder,
          onStart: onPasteStart,
          onSaved: (id, { index, total }) =>
            onSaveSuccess?.(id, { quiet: true, last: index === total }),
        });
        const { tone, message } = batchSummary(outcome, pasted.skipped, folder);
        toast[tone](message);
      } finally {
        savingMany.current = false;
        // The batch's one indicator goes now, whatever happened.
        onBatchDone?.();
      }
    },
    [currentFolder, onPasteStart, onSaveSuccess, onBatchDone],
  );

  const save = useCallback(
    async (text: string) => {
      // Several links (a list, one per line): save each. Anything else, a
      // single URL or plain text, goes the single-save way, errors included.
      const pasted = parsePastedUrls(text);
      if (pasted.urls.length >= 2) {
        await saveMany(pasted);
        return;
      }

      onPasteStart?.(text);

      const result = await saveLink(
        text,
        currentFolder
          ? {
              folder: {
                id: currentFolder.id,
                name: currentFolder.name,
                emoji: currentFolder.emoji,
              },
            }
          : undefined,
      );
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
    [onPasteStart, onSaveSuccess, onSaveError, currentFolder, saveMany],
  );

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;

      if (isInputTarget) return;

      // Files (a copied image or file) upload; the text browsers put beside
      // them is only a placeholder name, so it's never saved too.
      const files = e.clipboardData?.files;
      if (uploadsEnabled && files && files.length > 0) {
        e.preventDefault();
        if (!requestUploadFiles(Array.from(files))) {
          toast.error(NO_UPLOAD_PAGE_MESSAGE);
        }
        return;
      }

      const text = e.clipboardData?.getData("text")?.trim();
      if (!text) return;

      e.preventDefault();
      await save(text);
    },
    [save, uploadsEnabled],
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
