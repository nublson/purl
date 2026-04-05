"use client";

import {
  extractMentionLinkIds,
  formatMentionToken,
} from "@/lib/chat-utils";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import {
  ChevronDown,
  ChevronLeft,
  MessageCircle,
  Plus,
  Square,
} from "lucide-react";
import * as React from "react";
import { chatSurfaceRef } from "./chat-context";
import { ChatHistory, type ChatListEntry } from "./chat-history";
import { ChatInput } from "./chat-input";
import { ChatMessages } from "./chat-messages";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

function normalizeClientLinks(links: Link[]): Link[] {
  return links.map((link) => ({
    ...link,
    createdAt:
      link.createdAt instanceof Date ? link.createdAt : new Date(link.createdAt),
  }));
}

function ChatSession({
  chatId,
  links,
  initialMessages,
  mentionSeed,
  onConsumedMentionSeed,
  onSessionControls,
}: {
  chatId: string;
  links: Link[];
  initialMessages: UIMessage[];
  mentionSeed: string | null;
  onConsumedMentionSeed: () => void;
  onSessionControls: (
    ctx: { busy: boolean; stop: () => Promise<void> } | null,
  ) => void;
}) {
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const transport = React.useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    onSessionControls({ busy, stop });
  }, [busy, stop, onSessionControls]);

  React.useEffect(() => {
    return () => {
      onSessionControls(null);
    };
  }, [onSessionControls]);

  React.useEffect(() => {
    if (mentionSeed) {
      setInput((prev) => {
        const t = prev.trim();
        return t ? `${t} ${mentionSeed}` : mentionSeed;
      });
      onConsumedMentionSeed();
    }
  }, [mentionSeed, onConsumedMentionSeed]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const handleSubmit = React.useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage(
      { text },
      {
        body: {
          chatId,
          mentionedLinkIds: extractMentionLinkIds(text),
        },
      },
    );
    setInput("");
  }, [input, busy, sendMessage, chatId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-muted/20">
        <div className="p-3">
          {error ? (
            <p className="mb-2 text-sm text-destructive" role="alert">
              {error.message}
            </p>
          ) : null}
          <ChatMessages messages={messages} status={status} />
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </ScrollArea>
      <ChatInput
        links={links}
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={busy}
      />
    </div>
  );
}

export function ChatPanel({
  links: linksProp,
  className,
}: {
  links: Link[];
  className?: string;
}) {
  const links = React.useMemo(
    () => normalizeClientLinks(linksProp),
    [linksProp],
  );

  const [widgetOpen, setWidgetOpen] = React.useState(false);
  const [showList, setShowList] = React.useState(true);
  const [chatList, setChatList] = React.useState<ChatListEntry[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [bootMessages, setBootMessages] = React.useState<UIMessage[]>([]);
  const [headerTitle, setHeaderTitle] = React.useState("Chats");
  const [sessionKey, setSessionKey] = React.useState(0);
  const [mentionSeed, setMentionSeed] = React.useState<string | null>(null);
  const [sessionControls, setSessionControls] = React.useState<{
    busy: boolean;
    stop: () => Promise<void>;
  } | null>(null);

  const activeChatIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const refreshChats = React.useCallback(async () => {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) return;
      const data = (await res.json()) as { chats?: ChatListEntry[] };
      setChatList(data.chats ?? []);
    } catch {
      setChatList([]);
    }
  }, []);

  React.useEffect(() => {
    if (widgetOpen) void refreshChats();
  }, [widgetOpen, refreshChats]);

  const ensureNewChatId = React.useCallback(async () => {
    const res = await fetch("/api/chats", { method: "POST" });
    if (!res.ok) throw new Error("Failed to create chat");
    const data = (await res.json()) as { id: string };
    await refreshChats();
    return data.id;
  }, [refreshChats]);

  const openWidget = React.useCallback(() => {
    setWidgetOpen(true);
  }, []);

  const openWithMention = React.useCallback(
    async (link: Link) => {
      setWidgetOpen(true);
      setShowList(false);
      let id = activeChatIdRef.current;
      if (!id) {
        id = await ensureNewChatId();
        setActiveChatId(id);
        setBootMessages([]);
        setHeaderTitle("New chat");
        setSessionKey((k) => k + 1);
      }
      setMentionSeed(`${formatMentionToken(link)} `);
    },
    [ensureNewChatId],
  );

  React.useEffect(() => {
    chatSurfaceRef.current = { openWithMention, openWidget };
    return () => {
      chatSurfaceRef.current = null;
    };
  }, [openWithMention, openWidget]);

  const goToList = React.useCallback(() => {
    setShowList(true);
    setActiveChatId(null);
    setBootMessages([]);
    setHeaderTitle("Chats");
    setSessionKey((k) => k + 1);
    setMentionSeed(null);
    setSessionControls(null);
  }, []);

  const handleSelectChat = React.useCallback(
    async (chat: ChatListEntry) => {
      try {
        const res = await fetch(`/api/chats/${chat.id}/messages`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: UIMessage[] };
        setBootMessages(data.messages ?? []);
        setActiveChatId(chat.id);
        setHeaderTitle(chat.title?.trim() || "Chat");
        setShowList(false);
        setSessionKey((k) => k + 1);
        setMentionSeed(null);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const handleNewConversation = React.useCallback(async () => {
    try {
      const id = await ensureNewChatId();
      setBootMessages([]);
      setActiveChatId(id);
      setHeaderTitle("New chat");
      setShowList(false);
      setSessionKey((k) => k + 1);
      setMentionSeed(null);
    } catch {
      /* ignore */
    }
  }, [ensureNewChatId]);

  return (
    <div className={cn(className)}>
      {!widgetOpen ? (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg"
          onClick={() => setWidgetOpen(true)}
          aria-label="Open chat"
        >
          <MessageCircle data-icon="inline-start" />
        </Button>
      ) : null}

      {widgetOpen ? (
        <>
          <button
            type="button"
            aria-label="Close chat overlay"
            className="fixed inset-0 z-40 bg-background/80 md:hidden"
            onClick={() => setWidgetOpen(false)}
          />
          <div
            className={cn(
              "fixed z-50 flex flex-col bg-background shadow-xl",
              "inset-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]",
              "md:bottom-6 md:right-6 md:left-auto md:top-auto md:h-[min(34rem,calc(100dvh-4rem))] md:w-[min(420px,calc(100vw-2rem))] md:rounded-xl md:border md:pt-0 md:shadow-lg",
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 md:rounded-t-xl">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {!showList ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={goToList}
                    aria-label="Back to chats"
                  >
                    <ChevronLeft data-icon="inline-start" />
                  </Button>
                ) : null}
                <h2 className="min-w-0 truncate text-sm font-semibold">
                  {headerTitle}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {sessionControls?.busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void sessionControls.stop()}
                  >
                    <Square className="size-3.5" />
                    Stop
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleNewConversation}
                  aria-label="New chat"
                >
                  <Plus data-icon="inline-start" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setWidgetOpen(false)}
                  aria-label="Minimize chat"
                >
                  <ChevronDown data-icon="inline-start" />
                </Button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-3 py-3 md:px-3">
              {showList ? (
                <ChatHistory
                  chats={chatList}
                  onSelectChat={handleSelectChat}
                  onNewChat={handleNewConversation}
                  className="min-h-0 flex-1 overflow-y-auto"
                />
              ) : activeChatId ? (
                <ChatSession
                  key={`${activeChatId}-${sessionKey}`}
                  chatId={activeChatId}
                  links={links}
                  initialMessages={bootMessages}
                  mentionSeed={mentionSeed}
                  onConsumedMentionSeed={() => setMentionSeed(null)}
                  onSessionControls={setSessionControls}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a chat or start a new conversation.
                </p>
              )}
            </div>

          </div>
        </>
      ) : null}
    </div>
  );
}
