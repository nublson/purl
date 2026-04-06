"use client";

import { useChatContext } from "@/contexts/chat-context";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatArea from "./chat-area";
import ChatHeader from "./chat-header";
import ChatInput from "./chat-input";

interface ChatConversationProps {
  onClose: () => void;
}

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function ChatConversation({ onClose }: ChatConversationProps) {
  const { chatId, mentions, clearMentions, createNewChat, setChatId } =
    useChatContext();
  const [input, setInput] = useState("");
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
    },
    [createNewChat, sendMessage],
  );

  const handleNewChat = useCallback(() => {
    setChatId(null);
    setMessages([]);
    clearMentions();
    setInput("");
  }, [setChatId, setMessages, clearMentions]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-start md:w-96">
      <ChatHeader onClose={onClose} onNewChat={handleNewChat} />
      <ChatArea
        messages={messages}
        isLoading={isLoading}
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
