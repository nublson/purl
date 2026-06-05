"use client";

import { AlertDialogWrapper } from "@/components/alert-dialog-wrapper";
import {
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

interface DeleteChatDialogProps {
  onDelete: () => Promise<boolean>;
  onSuccess: () => void;
  children: ReactNode;
}

export function DeleteChatDialog({
  onDelete,
  onSuccess,
  children,
}: DeleteChatDialogProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const ok = await onDelete();
      if (!ok) {
        toast.error("Could not delete chat.");
        return;
      }
      setOpen(false);
      onSuccess();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialogWrapper
      title="Delete this chat?"
      description="This permanently removes the chat and its messages. This cannot be undone."
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-md"
      content={
        <AlertDialogFooter className="px-6">
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            className="cursor-pointer"
            onClick={() => void handleDeleteConfirm()}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </AlertDialogFooter>
      }
    >
      {children}
    </AlertDialogWrapper>
  );
}
