"use client";

import { DeleteChatDialog } from "@/components/chat/chat-delete-dialog";
import {
  HistoryErrorBanner,
  type ChatHistoryLoadError,
} from "@/components/chat/chat-header";
import {
  ChatHistory,
  type ChatHistoryItem,
} from "@/components/chat/chat-history";
import { RenameChatDialog } from "@/components/chat/chat-rename-dialog";
import { DropdownWrapper } from "@/components/dropdown-wrapper";
import { Logo } from "@/components/logo";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAT_ERROR_CODES, parseChatErrorBody } from "@/lib/chat-http-errors";
import { ChevronDown, Ellipsis, Plus, SquarePen, Trash } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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

  const handleHistoryOpenChange = useCallback(
    (open: boolean) => {
      if (open && hasLoadedOnce.current) {
        void loadChats({ silent: true });
      }
    },
    [loadChats],
  );

  const handleChatActionSuccess = useCallback(() => {
    void loadChats({ silent: true });
  }, [loadChats]);

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
      <div className="w-full flex justify-between items-center gap-2 p-4 bg-linear-to-b from-background to-transparent">
        <div className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
          <div className="flex shrink-0 items-center justify-start gap-1">
            <Logo size={18} pathname="/home" />
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
            className="shrink-0 text-muted-foreground font-medium"
          >
            /
          </Typography>
          {isLoadingChat ? (
            <Skeleton className="h-8 w-28 max-w-full shrink" />
          ) : (
            <div className="min-w-0 flex-1 overflow-hidden">
              <ChatHistory
                chats={chats}
                isLoading={isLoading}
                onSelectChat={onSelectChat}
                onOpenChange={handleHistoryOpenChange}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-w-full min-w-0 shrink cursor-pointer gap-1 overflow-hidden"
                >
                  <span className="min-w-0 truncate">{label}</span>
                  <ChevronDown className="shrink-0" />
                </Button>
              </ChatHistory>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
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
          <DropdownWrapper
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer"
                aria-label="More options"
              >
                <Ellipsis />
              </Button>
            }
            align="end"
          >
            <RenameChatDialog
              label={label}
              onRename={async (nextTitle) => {
                if (!onRenameChat) return false;
                return onRenameChat(nextTitle);
              }}
              onSuccess={handleChatActionSuccess}
            >
              <DropdownMenuItem
                disabled={menuDisabled}
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                <SquarePen /> <span>Rename</span>
              </DropdownMenuItem>
            </RenameChatDialog>
            <DeleteChatDialog
              onDelete={async () => {
                if (!onDeleteChat) return false;
                return onDeleteChat();
              }}
              onSuccess={handleChatActionSuccess}
            >
              <DropdownMenuItem
                variant="destructive"
                disabled={menuDisabled}
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                <Trash /> <span>Delete</span>
              </DropdownMenuItem>
            </DeleteChatDialog>
          </DropdownWrapper>
        </div>
      </div>
    </header>
  );
}
