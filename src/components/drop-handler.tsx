"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { classifyDrop, draggingFiles } from "@/lib/drop-classify";
import { isTypingTarget } from "@/lib/keyboard";
import { requestSaveUrl } from "@/lib/save-link";
import { requestUploadFiles } from "@/lib/save-uploads";
import {
  NO_UPLOAD_PAGE_MESSAGE,
  UPLOADS_UNAVAILABLE_MESSAGE,
} from "@/lib/upload-picker";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const FOLDERS_MESSAGE = "Folders can't be uploaded";

/** The Settings dialog is open: its Import tab has its own drop zone. */
function settingsOpen(): boolean {
  return document.querySelector("[data-settings-dialog]") !== null;
}

/**
 * A `dragleave` out of the window (its point is off the viewport, or 0,0 in
 * browsers that zero it there). Enter/leave can stop pairing up (a drag that
 * ends over another app, an element removed mid-drag), so this resets.
 */
function leftWindow(event: DragEvent): boolean {
  const { clientX: x, clientY: y } = event;
  return (
    (x === 0 && y === 0) ||
    x < 0 ||
    y < 0 ||
    x >= window.innerWidth ||
    y >= window.innerHeight
  );
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
 * row's link) are left alone. While Settings is open the page uploads
 * nothing (its Import tab has its own drop zone), but a file dropped
 * outside that zone is still taken, so the browser never opens it.
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
    // The window lost focus (the drag went to another app, or ended there):
    // whatever was in progress is over. `dragend` never reaches the window
    // when an in-page drag's source was removed meanwhile.
    const onBlur = () => {
      internal = false;
      hide();
    };
    const onDragEnter = (event: DragEvent) => {
      // A drag carrying files always comes from outside the page (in-page
      // drags never carry files), coming in from beyond the window (no
      // `relatedTarget`): an `internal` left from an earlier drag is stale.
      // Not every null `relatedTarget`: Safari reports null for every drag
      // enter, which would clear the flag in the middle of an in-page drag.
      if (draggingFiles(event.dataTransfer) && event.relatedTarget === null) {
        internal = false;
      }
      if (internal || !uploadsEnabled || settingsOpen()) return;
      if (!draggingFiles(event.dataTransfer)) return;
      depth += 1;
      setOver(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (depth === 0) return;
      if (leftWindow(event)) {
        hide();
        return;
      }
      depth -= 1;
      if (depth === 0) setOver(false);
    };
    const onDragOver = (event: DragEvent) => {
      const transfer = event.dataTransfer;
      if (internal || !transfer || event.defaultPrevented) return;
      if (settingsOpen()) {
        // Taken (never opened by the browser), but not uploaded.
        if (draggingFiles(transfer)) event.preventDefault();
        return;
      }
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
      if (wasInternal || event.defaultPrevented) return;
      if (settingsOpen()) {
        // The Import tab takes its own drops; anywhere else in Settings a
        // file is only kept from opening in the browser.
        if (draggingFiles(event.dataTransfer)) event.preventDefault();
        return;
      }

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
        toast.error(UPLOADS_UNAVAILABLE_MESSAGE);
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
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
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
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-60 grid place-items-center bg-background/70 p-4 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 motion-safe:ease-out-strong"
    >
      <p className="rounded-2xl border-2 border-dashed border-foreground/40 bg-background px-8 py-6 text-base font-medium text-foreground shadow-sm">
        {folder ? `Drop to save to ${folder.emoji} ${folder.name}` : "Drop to save"}
      </p>
    </div>
  );
}
