"use client";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { useFolderActions, useFolders } from "@/hooks/use-folders";
import dynamic from "next/dynamic";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";

// Motion's drag (Reorder) is only needed here: the list loads in its own
// chunk when the folder menu opens (`preloadReorderFoldersList`), not with
// Home.
const loadReorderList = () =>
  import("./reorder-folders-list").then((mod) => mod.ReorderFoldersList);

/** Starts loading the dialog's list; safe to call repeatedly. */
export const preloadReorderFoldersList = () =>
  void loadReorderList().catch(() => {});

const ReorderFoldersList = dynamic(loadReorderList, {
  ssr: false,
  loading: () => <div className="min-h-40" aria-busy="true" />,
});

/**
 * "Reorder folders": drag rows by their grip, or use Move up / Move down
 * (⌥↑ / ⌥↓ on a focused row). Works on a copy; Save sends the whole order
 * (saved optimistically, toasts on failure) and Cancel drops it.
 */
export function DialogReorderFolders({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { folders } = useFolders();
  const { reorderFolders } = useFolderActions();
  const [draft, setDraft] = React.useState(folders);

  // Each opening starts from the current order.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(folders);
  }

  const changed =
    draft.length !== folders.length ||
    draft.some((folder, index) => folder.id !== folders[index]?.id);

  function save() {
    onOpenChange(false);
    void reorderFolders(draft.map((folder) => folder.id));
  }

  return (
    <DialogWrapper
      title="Reorder folders"
      description="Drag folders into the order you want. Number keys follow it."
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-md"
      content={
        <div className="flex min-h-0 flex-col gap-4">
          <div className="max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-y-contain px-5">
            <ReorderFoldersList folders={draft} onChange={setDraft} />
          </div>
          <DialogFooter className="px-6">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" disabled={!changed} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </div>
      }
    />
  );
}
