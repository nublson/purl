"use client";

import { DialogWrapper } from "@/components/dialog-wrapper";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

interface RenameChatDialogProps {
  label: string;
  onRename: (title: string) => Promise<boolean>;
  onSuccess: () => void;
  children: ReactNode;
}

export function RenameChatDialog({
  label,
  onRename,
  onSuccess,
  children,
}: RenameChatDialogProps) {
  const [open, setOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    if (open) {
      setRenameValue(label === "New chat" ? "" : label);
    }
  }, [open, label]);

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("Enter a chat name.");
      return;
    }

    setIsRenaming(true);
    try {
      const ok = await onRename(trimmed);
      if (!ok) {
        toast.error("Could not rename chat.");
        return;
      }
      setOpen(false);
      onSuccess();
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <DialogWrapper
      title="Rename chat"
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-md"
      content={
        <div className="flex flex-col gap-6 px-6 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="chat-rename-title">Name</Label>
            <Input
              id="chat-rename-title"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={80}
              disabled={isRenaming}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRenameSubmit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isRenaming}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => void handleRenameSubmit()}
              disabled={isRenaming}
            >
              {isRenaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </div>
      }
    >
      {children}
    </DialogWrapper>
  );
}
