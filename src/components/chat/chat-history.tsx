"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquarePlus } from "lucide-react";
import * as React from "react";

export type ChatListEntry = {
  id: string;
  title: string | null;
  updatedAt: string;
};

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function ChatHistory({
  chats,
  onSelectChat,
  onNewChat,
  className,
}: {
  chats: ChatListEntry[];
  onSelectChat: (chat: ChatListEntry) => void;
  onNewChat: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button
        type="button"
        variant="default"
        className="w-full justify-center gap-2"
        onClick={onNewChat}
      >
        <MessageSquarePlus data-icon="inline-start" />
        New conversation
      </Button>
      <div className="flex flex-col gap-1">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Recent
        </p>
        {chats.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No chats yet. Start a new conversation.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => onSelectChat(chat)}
                  className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="line-clamp-2 text-sm font-medium">
                    {chat.title?.trim() || "New chat"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(chat.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
