"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { requestUploadFiles } from "@/lib/save-uploads";
import {
  isUploadShortcut,
  NO_UPLOAD_PAGE_MESSAGE,
  UPLOAD_PICK_EVENT,
} from "@/lib/upload-picker";
import { UPLOAD_MIME_TYPES } from "@/lib/uploads/mime";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const ACCEPT = UPLOAD_MIME_TYPES.join(",");

/**
 * The page's file picker (Home and folder pages): a hidden file input that
 * the + menu's "Upload files" opens (`openUploadPicker`) and `U` opens (not
 * while typing, or with a dialog or menu open, like `A`). The chosen files
 * go to the page's upload queue. Nothing when uploads are off or in the
 * landing demo.
 */
export function UploadInput() {
  const { uploadsEnabled } = useCurrentUser();
  const isDemo = useIsDemo();
  const inputRef = useRef<HTMLInputElement>(null);
  const enabled = uploadsEnabled && !isDemo;

  useEffect(() => {
    if (!enabled) return;
    const open = () => inputRef.current?.click();
    const onPick = (event: Event) => {
      // Taken: `openUploadPicker` tells the + menu a picker answered.
      event.preventDefault();
      open();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isUploadShortcut(event)) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;
      event.preventDefault();
      open();
    };
    window.addEventListener(UPLOAD_PICK_EVENT, onPick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(UPLOAD_PICK_EVENT, onPick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ACCEPT}
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      data-cy="upload-input"
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        // Cleared, so choosing the same file again still fires a change.
        event.currentTarget.value = "";
        if (files.length > 0 && !requestUploadFiles(files)) {
          toast.error(NO_UPLOAD_PAGE_MESSAGE);
        }
      }}
    />
  );
}
