"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { classifyDrop, draggingFiles } from "@/lib/drop-classify";
import { isTypingTarget } from "@/lib/keyboard";
import { requestSaveUrl } from "@/lib/save-link";
import { requestUploadFiles } from "@/lib/save-uploads";
import { NO_UPLOAD_PAGE_MESSAGE } from "@/lib/upload-picker";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const FOLDERS_MESSAGE = "Folders can't be uploaded";
const UNAVAILABLE_MESSAGE = "Uploads aren't available here";

/** The Settings dialog is open: its Import tab has its own drop zone. */
function settingsOpen(): boolean {
  return document.querySelector("[data-settings-dialog]") !== null;
}

function carriesText(transfer: DataTransfer): boolean {
  const types = Array.from(transfer.types);
  return types.includes("text/uri-list") || types.includes("text/plain");
}

/**
 * Drops on Home and folder pages (beside `PasteHandler`): files dragged over
 * the window show a full-page overlay, "Drop to save" (or "Drop to save to
 * 📚 Reading" on a folder page), and dropping them uploads them. A dragged
 * link or text is saved like a paste. Drags that start on the page (a
 * row's link) are left alone, and so is everything while Settings is open.
 */
export function DropHandler({
  folder,
}: {
  /** The page's folder; null on Home. */
  folder: { emoji: string; name: string } | null;
}) {
  const { uploadsEnabled } = useCurrentUser();
  const isDemo = useIsDemo();
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    // Enter/leave fire for every element the drag crosses: the overlay
    // shows from the first enter until the matching last leave.
    let depth = 0;
    // A drag that started on the page itself (a row's link, an image).
    let internal = false;
    const hide = () => {
      depth = 0;
      setOver(false);
    };

    const onDragStart = () => {
      internal = true;
    };
    const onDragEnd = () => {
      internal = false;
      hide();
    };
    const onDragEnter = (event: DragEvent) => {
      if (internal || !uploadsEnabled || settingsOpen()) return;
      if (!draggingFiles(event.dataTransfer)) return;
      depth += 1;
      setOver(true);
    };
    const onDragLeave = () => {
      if (depth === 0) return;
      depth -= 1;
      if (depth === 0) setOver(false);
    };
    const onDragOver = (event: DragEvent) => {
      const transfer = event.dataTransfer;
      if (internal || !transfer || event.defaultPrevented || settingsOpen()) return;
      // Files are always the page's (the browser would open them and leave
      // the app); text dragged over a field is the field's.
      const files = draggingFiles(transfer);
      if (!files && !(carriesText(transfer) && !isTypingTarget(event.target))) {
        return;
      }
      event.preventDefault();
      transfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      const wasInternal = internal;
      internal = false;
      hide();
      if (wasInternal || event.defaultPrevented || settingsOpen()) return;

      const content = classifyDrop(event.dataTransfer);
      if (!content) return;
      if ("text" in content) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        // The page's paste flow: one link, several, or text it refuses.
        requestSaveUrl(content.text);
        return;
      }

      event.preventDefault();
      if (!uploadsEnabled) {
        toast.error(UNAVAILABLE_MESSAGE);
        return;
      }
      if ("folder" in content || content.folders > 0) {
        toast.error(FOLDERS_MESSAGE);
      }
      if ("files" in content && !requestUploadFiles(content.files)) {
        toast.error(NO_UPLOAD_PAGE_MESSAGE);
      }
    };

    window.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      setOver(false);
    };
  }, [isDemo, uploadsEnabled]);

  if (!over) return null;
  return (
    // Never a drop target itself (`pointer-events-none`): the drag's events
    // keep reaching the page under it, so enter/leave stay paired.
    <div
      data-cy="drop-overlay"
      className="pointer-events-none fixed inset-0 z-60 grid place-items-center bg-background/70 p-4 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
    >
      <p className="rounded-2xl border-2 border-dashed border-foreground/25 bg-background px-8 py-6 text-base font-medium text-foreground shadow-sm">
        {folder ? `Drop to save to ${folder.emoji} ${folder.name}` : "Drop to save"}
      </p>
    </div>
  );
}
