"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  useFolderActions,
  useFolders,
  type FolderSummary,
} from "@/hooks/use-folders";
import { formatLinkCount } from "@/lib/folder-display";
import * as React from "react";
import { Typography } from "./typography";

type Pending = "keep" | "with-links" | null;

/**
 * Controlled delete confirmation for a folder. A folder with links offers
 * "Delete folder only" (its links stay saved, unfiled) or "Delete folder and
 * links"; an empty one just "Delete folder". Stays open with an inline
 * error if the request fails.
 */
export function DialogDeleteFolder({
  folder: snapshot,
  open,
  onOpenChange,
}: {
  /** The folder as it was when the dialog was opened; the live list wins. */
  folder: FolderSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { deleteFolder } = useFolderActions();
  const { folders } = useFolders();
  // Read the live entry (link count, name, emoji) so the copy and the
  // keep/delete-links choice track links added or moved while it's open.
  // Once the folder leaves the list (e.g. the delete succeeded and the dialog
  // is animating out), keep showing it as it last was, else the snapshot.
  const live = folders.find((candidate) => candidate.id === snapshot.id);
  const [lastLive, setLastLive] = React.useState<FolderSummary | null>(null);
  if (live && live !== lastLive) setLastLive(live);
  const folder = live ?? lastLive ?? snapshot;
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const hasLinks = folder.linkCount > 0;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function handleDelete(withLinks: boolean) {
    setPending(withLinks ? "with-links" : "keep");
    setError(null);
    const result = await deleteFolder(folder.id, { withLinks });
    setPending(null);
    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.error);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent size="default" className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Delete {folder.emoji} {folder.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasLinks
              ? `Its ${formatLinkCount(folder.linkCount)} stay saved unless you delete them too. Deleted links can’t be recovered.`
              : "This folder is empty."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Typography
            component="p"
            size="small"
            role="alert"
            className="text-destructive"
          >
            {error}
          </Typography>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending !== null}>Cancel</AlertDialogCancel>
          {hasLinks ? (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={pending !== null}
                onClick={() => handleDelete(true)}
              >
                {pending === "with-links" ? "Deleting…" : "Delete folder and links"}
              </Button>
              <Button
                type="button"
                disabled={pending !== null}
                onClick={() => handleDelete(false)}
              >
                {pending === "keep" ? "Deleting…" : "Delete folder only"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={pending !== null}
              onClick={() => handleDelete(false)}
            >
              {pending === "keep" ? "Deleting…" : "Delete folder"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
