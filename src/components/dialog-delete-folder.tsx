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
import { useFolderActions, type FolderSummary } from "@/hooks/use-folders";
import { formatLinkCount } from "@/lib/folder-display";
import * as React from "react";

type Pending = "keep" | "with-links" | null;

/**
 * Controlled delete confirmation for a folder. A folder with links offers
 * "Keep links" (they move to Home) or "Delete links too"; an empty one just
 * "Delete". Stays open with an inline error if the request fails.
 */
export function DialogDeleteFolder({
  folder,
  open,
  onOpenChange,
}: {
  folder: FolderSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { deleteFolder } = useFolderActions();
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
              ? `It has ${formatLinkCount(folder.linkCount)}. Keep them and they move to Home, or delete them with the folder.`
              : "It has no links."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
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
                {pending === "with-links" ? "Deleting…" : "Delete links too"}
              </Button>
              <Button
                type="button"
                disabled={pending !== null}
                onClick={() => handleDelete(false)}
              >
                {pending === "keep" ? "Deleting…" : "Keep links"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={pending !== null}
              onClick={() => handleDelete(false)}
            >
              {pending === "keep" ? "Deleting…" : "Delete"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
