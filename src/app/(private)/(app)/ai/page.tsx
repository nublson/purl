"use client";

import type { ChatHistoryItem } from "@/components/chat/chat-history";
import ChatInput from "@/components/chat/chat-input";
import ChatItem from "@/components/chat/chat-item";
import ChatItemGroup from "@/components/chat/chat-item-group";
import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";
import { useChatContext } from "@/contexts/chat-context";
import { chatEmptySuggestions } from "@/data/chat-empty-suggestions";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function AiPage() {
  const router = useRouter();
  const { mentions, triggerSend, setChatId, startNewChat } = useChatContext();
  const [input, setInput] = useState("");
  const [recentChats, setRecentChats] = useState<ChatHistoryItem[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);

  const loadRecentChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const res = await fetch("/api/chats");
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        setRecentChats([]);
        return;
      }
      const data = body as { chats?: ChatHistoryItem[] };
      const chats = data.chats ?? [];
      setRecentChats(chats.slice(0, 5));
    } catch {
      setRecentChats([]);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentChats();
  }, [loadRecentChats]);

  const goToChat = useCallback(() => {
    router.push("/chat");
  }, [router]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text) return;
      const mentionSnapshot = [...mentions];
      startNewChat();
      triggerSend(text, mentionSnapshot);
      setInput("");
      goToChat();
    },
    [input, mentions, startNewChat, triggerSend, goToChat],
  );

  const handleSelectRecent = useCallback(
    (id: string) => {
      setChatId(id);
      goToChat();
    },
    [setChatId, goToChat],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      startNewChat();
      triggerSend(text);
      goToChat();
    },
    [startNewChat, triggerSend, goToChat],
  );

  return (
    <div className="wrapper-private flex flex-1 flex-col items-center justify-center gap-0 pt-24 pb-32">
      <div className="flex flex-col items-center justify-center gap-4 mb-8">
        <Logo size={64} />
        <Typography component="h2" variant="h2" className="text-center">
          What magic shall we make happen?
        </Typography>
      </div>
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isLoading={false}
        className="min-h-16"
      />
      <div className="w-full flex flex-col md:flex-row items-start justify-between gap-4 px-0 md:px-4 pt-14">
        <ChatItemGroup title="Recent chats">
          {isLoadingChats ? (
            <Typography size="small" className="text-muted-foreground px-2.5">
              Loading…
            </Typography>
          ) : recentChats.length === 0 ? (
            <Typography size="small" className="text-muted-foreground px-2.5">
              No past chats
            </Typography>
          ) : (
            recentChats.map((chat) => (
              <ChatItem
                key={chat.id}
                title={chat.title?.trim() || "New chat"}
                onClick={() => handleSelectRecent(chat.id)}
              />
            ))
          )}
        </ChatItemGroup>

        <ChatItemGroup title="Suggested">
          {chatEmptySuggestions.map(({ title, Icon }) => (
            <ChatItem
              key={title}
              title={title}
              icon={<Icon className="size-4" />}
              onClick={() => handleSuggestion(title)}
            />
          ))}
        </ChatItemGroup>
      </div>
    </div>
  );
}