"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Typography } from "../typography";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { ChatHistory, type ChatHistoryItem } from "./chat-history";

interface ChatHeaderProps {
  title: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  isLoadingChat?: boolean;
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
  const hasLoadedOnce = useRef(false);

  const loadChats = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) return;
      const data = (await res.json()) as { chats: ChatHistoryItem[] };
      setChats(data.chats);
    } catch {
      /* ignore */
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
    <header className="w-full flex items-center justify-between gap-4 px-4 py-2 border-b border-border">
      {isLoadingChat ? (
        <Skeleton className="h-3.5 w-32" />
      ) : (
        <Typography
          component="h3"
          size="small"
          className="text-accent-foreground font-medium line-clamp-1 break-all"
        >
          {label}
        </Typography>
      )}
      <div className="flex items-center justify-center gap-2">
        <ChatHistory
          chats={chats}
          isLoading={isLoading}
          onSelectChat={onSelectChat}
          onOpenChange={handleHistoryOpenChange}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer"
          onClick={onNewChat}
        >
          <Plus />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer md:hidden"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
    </header>
  );
}
