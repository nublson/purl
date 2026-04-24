"use client";

import {
  CHAT_ERROR_CODES,
  ChatRequestError,
  parseChatErrorBody,
} from "@/lib/chat-http-errors";
import {
  clearLastChatId,
  getLastChatId,
  setLastChatId,
} from "@/lib/chat-storage";
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
  /** Clears active chat and last-chat persistence; use for explicit "new chat" only. */
  startNewChat: () => void;
  addMention: (link: Link) => void;
  removeMention: (linkId: string) => void;
  clearMentions: () => void;
  createNewChat: () => Promise<string>;
  setChatId: (id: string | null) => void;
  pendingSummarize: Link | null;
  triggerSummarize: (link: Link) => void;
  clearPendingSummarize: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatId, setChatIdState] = useState<string | null>(() =>
    getLastChatId(),
  );
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [mentions, setMentions] = useState<Link[]>([]);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [pendingSummarize, setPendingSummarize] = useState<Link | null>(null);

  const setChatId = useCallback((id: string | null) => {
    setChatIdState(id);
    if (id) {
      setLastChatId(id);
    } else {
      clearLastChatId();
    }
  }, []);

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
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const parsed = parseChatErrorBody(body);
      const headerRetry = res.headers.get("Retry-After");
      const retrySec =
        headerRetry != null ? parseInt(headerRetry, 10) : undefined;
      throw new ChatRequestError(
        res.status,
        parsed?.code ?? CHAT_ERROR_CODES.INTERNAL_ERROR,
        parsed?.message ?? "Could not create a new chat.",
        parsed?.retryAfterSeconds ??
          (Number.isFinite(retrySec) ? retrySec : undefined),
      );
    }
    const data = body as { id?: string; title?: string | null };
    if (typeof data.id !== "string" || !data.id) {
      throw new ChatRequestError(
        500,
        CHAT_ERROR_CODES.INTERNAL_ERROR,
        "Invalid response when creating chat.",
      );
    }
    setChatId(data.id);
    const nextTitle =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : null;
    setChatTitle(nextTitle);
    setMentions([]);
    return data.id;
  }, [setChatId]);

  const startNewChat = useCallback(() => {
    setChatId(null);
    setChatTitle(null);
    setMentions([]);
  }, [setChatId]);

  const triggerSummarize = useCallback((link: Link) => {
    // Defer until after the link DropdownMenu finishes dismissing; otherwise Radix can
    // treat the menu-close interaction as outside the chat Popover and close it immediately.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPendingSummarize(link);
        setIsWidgetOpen(true);
      });
    });
  }, []);

  const clearPendingSummarize = useCallback(() => {
    setPendingSummarize(null);
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
        startNewChat,
        addMention,
        removeMention,
        clearMentions,
        createNewChat,
        setChatId,
        pendingSummarize,
        triggerSummarize,
        clearPendingSummarize,
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
