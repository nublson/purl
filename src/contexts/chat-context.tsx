"use client";

import type { Link } from "@/utils/links";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface ChatContextValue {
  chatId: string | null;
  chatTitle: string | null;
  setChatTitle: (title: string | null) => void;
  mentions: Link[];
  isWidgetOpen: boolean;
  setIsWidgetOpen: (open: boolean) => void;
  addMention: (link: Link) => void;
  removeMention: (linkId: string) => void;
  clearMentions: () => void;
  createNewChat: () => Promise<string>;
  setChatId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [mentions, setMentions] = useState<Link[]>([]);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);

  const addMention = useCallback((link: Link) => {
    setMentions((prev) => {
      if (prev.some((m) => m.id === link.id)) return prev;
      return [...prev, link];
    });
  }, []);

  const removeMention = useCallback((linkId: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== linkId));
  }, []);

  const clearMentions = useCallback(() => {
    setMentions([]);
  }, []);

  const createNewChat = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/chats", { method: "POST" });
    const data = await res.json();
    setChatId(data.id);
    const nextTitle =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : null;
    setChatTitle(nextTitle);
    setMentions([]);
    return data.id;
  }, []);

  return (
    <ChatContext
      value={{
        chatId,
        chatTitle,
        setChatTitle,
        mentions,
        isWidgetOpen,
        setIsWidgetOpen,
        addMention,
        removeMention,
        clearMentions,
        createNewChat,
        setChatId,
      }}
    >
      {children}
    </ChatContext>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

export function useChatContextSafe() {
  return useContext(ChatContext);
}
