"use client";

import { useChatContext } from "@/contexts/chat-context";
import type { Link } from "@/utils/links";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatArea from "./chat-area";
import ChatHeader from "./chat-header";
import ChatInput from "./chat-input";

interface ChatConversationProps {
  onClose: () => void;
}

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function ChatConversation({ onClose }: ChatConversationProps) {
  const {
    chatId,
    chatTitle,
    setChatTitle,
    mentions,
    clearMentions,
    createNewChat,
    setChatId,
    pendingSummarize,
    clearPendingSummarize,
  } = useChatContext();
  const [input, setInput] = useState("");
  const [messageMentions, setMessageMentions] = useState<Link[][]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const chatIdRef = useRef(chatId);
  const mentionsRef = useRef(mentions);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    mentionsRef.current = mentions;
  }, [mentions]);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const wasLoadingRef = useRef(false);
  const summarizeInFlightRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && chatId) {
      void (async () => {
        try {
          const res = await fetch(`/api/chats/${chatId}`);
          if (!res.ok) return;
          const data = (await res.json()) as { title?: string | null };
          const next =
            typeof data.title === "string" && data.title.trim()
              ? data.title.trim()
              : null;
          setChatTitle(next);
        } catch {
          /* ignore */
        }
      })();
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, chatId, setChatTitle]);

  useEffect(() => {
    if (!pendingSummarize || summarizeInFlightRef.current) return;

    summarizeInFlightRef.current = true;
    const link = pendingSummarize;
    clearPendingSummarize();

    void (async () => {
      try {
        let id = chatIdRef.current;
        if (!id) {
          id = await createNewChat();
        }

        sendMessage(
          { text: `Summarize @${link.title}` },
          { body: { chatId: id, mentionedLinkIds: [link.id] } },
        );
        setMessageMentions((prev) => [...prev, [link]]);
      } finally {
        summarizeInFlightRef.current = false;
      }
    })();
  }, [pendingSummarize, clearPendingSummarize, createNewChat, sendMessage]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text) return;

      let id = chatIdRef.current;
      if (!id) {
        id = await createNewChat();
      }

      const mentionedLinkIds = mentionsRef.current.map((m) => m.id);
      sendMessage({ text }, { body: { chatId: id, mentionedLinkIds } });
      setMessageMentions((prev) => [...prev, [...mentionsRef.current]]);
      setInput("");
      clearMentions();
    },
    [input, createNewChat, sendMessage, clearMentions],
  );

  const handleSuggestion = useCallback(
    async (text: string) => {
      let id = chatIdRef.current;
      if (!id) {
        id = await createNewChat();
      }

      sendMessage({ text }, { body: { chatId: id } });
      setMessageMentions((prev) => [...prev, []]);
    },
    [createNewChat, sendMessage],
  );

  const handleNewChat = useCallback(() => {
    setChatId(null);
    setChatTitle(null);
    setMessages([]);
    setMessageMentions([]);
    clearMentions();
    setInput("");
  }, [setChatId, setChatTitle, setMessages, clearMentions]);

  const handleSelectChat = useCallback(
    async (id: string) => {
      setIsLoadingChat(true);
      try {
        const res = await fetch(`/api/chats/${id}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          id: string;
          title: string | null;
          messages: {
            id: string;
            role: "USER" | "ASSISTANT";
            content: string;
            mentions: Link[];
          }[];
        };

        const converted: UIMessage[] = data.messages.map((msg) => ({
          id: msg.id,
          role: msg.role === "USER" ? "user" : "assistant",
          content: msg.content,
          parts: [{ type: "text" as const, text: msg.content }],
        }));

        const rebuiltMentions: Link[][] = data.messages.map((msg) =>
          msg.role === "USER" ? msg.mentions : [],
        );

        setMessages(converted);
        setMessageMentions(rebuiltMentions);
        setChatId(id);
        setChatTitle(data.title?.trim() || null);
        clearMentions();
        setInput("");
      } catch {
        /* ignore */
      } finally {
        setIsLoadingChat(false);
      }
    },
    [setMessages, setChatId, setChatTitle, clearMentions],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-start md:w-96">
      <ChatHeader
        title={chatTitle}
        onClose={onClose}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        isLoadingChat={isLoadingChat}
      />
      <ChatArea
        messages={messages}
        messageMentions={messageMentions}
        isLoading={isLoading}
        isLoadingChat={isLoadingChat}
        onSuggestion={handleSuggestion}
      />
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
