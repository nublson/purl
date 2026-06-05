"use client";

import { CHAT_ERROR_CODES, parseChatErrorBody } from "@/lib/chat-http-errors";
import { ChevronDown, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TooltipWrapper } from "../tooltip-wrapper";
import { Typography } from "../typography";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { ChatHistory, type ChatHistoryItem } from "./chat-history";
import { RateLimitCountdown } from "./rate-limit-countdown";

export type ChatHistoryLoadError =
  | { kind: "session" }
  | { kind: "rate_limit"; untilMs: number }
  | { kind: "retry"; message: string };

interface ChatHeaderProps {
  title: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  isLoadingChat?: boolean;
}

export function HistoryErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: ChatHistoryLoadError;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (error.kind === "session") {
    return (
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
        <Typography size="small" className="text-foreground">
          Please sign in again to load chat history.
        </Typography>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  if (error.kind === "rate_limit") {
    return (
      <div className="flex w-full flex-col gap-1 border-b border-border bg-muted/40 px-4 py-2">
        <RateLimitCountdown untilMs={error.untilMs} onExpire={onDismiss} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
      <Typography size="small" className="text-foreground">
        {error.message}
      </Typography>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export default function ChatHeader({
  title,
  onClose,
  onNewChat,
  onSelectChat,
  isLoadingChat,
}: ChatHeaderProps) {
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

  return (
    <header className="flex w-full flex-col">
      {historyError ? (
        <HistoryErrorBanner
          error={historyError}
          onRetry={() => void loadChats({ silent: false })}
          onDismiss={() => setHistoryError(null)}
        />
      ) : null}
      <div className="flex w-full items-center justify-between gap-4 px-4 py-2">
        {isLoadingChat ? (
          <Skeleton className="h-3.5 w-32" />
        ) : (
          <div className="max-w-72 flex items-center justify-start gap-1">
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
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <TooltipWrapper content="New chat">
            <Button
              size="icon-sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={onNewChat}
            >
              <Plus />
            </Button>
          </TooltipWrapper>
          <TooltipWrapper content="Close chat">
            <Button
              size="icon-sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={onClose}
            >
              <Minus />
            </Button>
          </TooltipWrapper>
        </div>
      </div>
    </header>
  );
}
