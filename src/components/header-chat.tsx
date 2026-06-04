"use client";

import {
  HistoryErrorBanner,
  type ChatHistoryLoadError,
} from "@/components/chat/chat-header";
import { ChatHistory, type ChatHistoryItem } from "@/components/chat/chat-history";
import { Logo } from "@/components/logo";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Typography } from "@/components/typography";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAT_ERROR_CODES, parseChatErrorBody } from "@/lib/chat-http-errors";
import { ChevronDown, Ellipsis, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface HeaderChatProps {
  title: string | null;
  chatId?: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onRenameChat?: (title: string) => Promise<boolean>;
  onDeleteChat?: () => Promise<boolean>;
  isLoadingChat?: boolean;
}

export default function HeaderChat({
  title,
  chatId,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  isLoadingChat,
}: HeaderChatProps) {
  const label = title && title.trim().length > 0 ? title.trim() : "New chat";

  const [chats, setChats] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyError, setHistoryError] = useState<ChatHistoryLoadError | null>(
    null,
  );
  const hasLoadedOnce = useRef(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadChats = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch("/api/chats");
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok) {
        const parsed = parseChatErrorBody(body);
        if (
          res.status === 401 ||
          parsed?.code === CHAT_ERROR_CODES.SESSION_EXPIRED
        ) {
          setHistoryError({ kind: "session" });
        } else if (
          res.status === 429 ||
          parsed?.code === CHAT_ERROR_CODES.RATE_LIMITED
        ) {
          const sec = parsed?.retryAfterSeconds ?? 60;
          setHistoryError({
            kind: "rate_limit",
            untilMs: Date.now() + sec * 1000,
          });
        } else {
          setHistoryError({
            kind: "retry",
            message: parsed?.message?.trim() || "Could not load chat history.",
          });
        }
        if (!silent) {
          setIsLoading(false);
          hasLoadedOnce.current = true;
        }
        return;
      }

      setHistoryError(null);
      const data = body as { chats?: ChatHistoryItem[] };
      setChats(data.chats ?? []);
    } catch {
      setHistoryError({
        kind: "retry",
        message: "Network error. Check your connection.",
      });
    } finally {
      if (!silent) {
        setIsLoading(false);
        hasLoadedOnce.current = true;
      }
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (renameOpen) {
      setRenameValue(label === "New chat" ? "" : label);
    }
  }, [renameOpen, label]);

  const handleHistoryOpenChange = useCallback(
    (open: boolean) => {
      if (open && hasLoadedOnce.current) {
        void loadChats({ silent: true });
      }
    },
    [loadChats],
  );

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("Enter a chat name.");
      return;
    }
    if (!onRenameChat) return;

    setIsRenaming(true);
    try {
      const ok = await onRenameChat(trimmed);
      if (!ok) {
        toast.error("Could not rename chat.");
        return;
      }
      setRenameOpen(false);
      void loadChats({ silent: true });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!onDeleteChat) return;

    setIsDeleting(true);
    try {
      const ok = await onDeleteChat();
      if (!ok) {
        toast.error("Could not delete chat.");
        return;
      }
      setDeleteOpen(false);
      void loadChats({ silent: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const menuDisabled = !chatId;

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex flex-col transform-none">
      {historyError ? (
        <HistoryErrorBanner
          error={historyError}
          onRetry={() => void loadChats({ silent: false })}
          onDismiss={() => setHistoryError(null)}
        />
      ) : null}
      <div className="w-full flex justify-between items-center p-4 bg-linear-to-b from-background to-transparent">
        <div className="flex items-center justify-start gap-1">
          <div className="flex items-center justify-start gap-1">
            <Logo size={18} />
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              asChild
            >
              <Link href="/ai">
                <Typography
                  component="span"
                  size="small"
                  className="text-accent-foreground font-medium"
                >
                  Purl AI
                </Typography>
              </Link>
            </Button>
          </div>
          <Typography
            component="span"
            size="small"
            className="text-muted-foreground font-medium"
          >
            /
          </Typography>
          {isLoadingChat ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <ChatHistory
              chats={chats}
              isLoading={isLoading}
              onSelectChat={onSelectChat}
              onOpenChange={handleHistoryOpenChange}
            >
              <Button variant="ghost" size="sm" className="cursor-pointer">
                {label} <ChevronDown />
              </Button>
            </ChatHistory>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <TooltipWrapper content="New chat">
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              onClick={onNewChat}
            >
              <Plus />
            </Button>
          </TooltipWrapper>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer"
                disabled={menuDisabled}
                aria-label="More options"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={menuDisabled}
                onSelect={() => setRenameOpen(true)}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={menuDisabled}
                onSelect={() => setDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleRenameSubmit()}
              disabled={isRenaming}
            >
              {isRenaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="default" className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the chat and its messages. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
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
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
