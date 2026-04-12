"use client";

import { useChatContext } from "@/contexts/chat-context";
import { useSession } from "@/lib/auth-client";
import {
  chatFlowErrorFromHttp,
  chatFlowErrorFromRequestError,
  type ChatFlowError,
} from "@/lib/chat-flow-error";
import {
  isChatRequestError,
  throwIfChatErrorResponse,
} from "@/lib/chat-http-errors";
import {
  chatFlowErrorFromStreamPayload,
  isChatStreamErrorPayload,
} from "@/lib/chat-stream-error";
import { loadChatFromApi } from "@/lib/load-chat";
import {
  clearChatSnapshot,
  clearDraft,
  DRAFT_NEW_CHAT_KEY,
  getChatSnapshot,
  getDraft,
  setChatSnapshot,
  setDraft,
} from "@/lib/chat-storage";
import type { Link } from "@/utils/links";
import { useChat } from "@ai-sdk/react";
import * as Sentry from "@sentry/nextjs";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ChatArea from "./chat-area";
import ChatHeader from "./chat-header";
import ChatInput from "./chat-input";

interface ChatConversationProps {
  onClose: () => void;
}

function newRequestId(): string {
  return crypto.randomUUID();
}

export default function ChatConversation({ onClose }: ChatConversationProps) {
  const {
    chatId,
    chatTitle,
    setChatTitle,
    mentions,
    clearMentions,
    createNewChat,
    setChatId,
    startNewChat,
    pendingSummarize,
    clearPendingSummarize,
  } = useChatContext();
  const { data: sessionData } = useSession();
  const sessionUser = sessionData?.user;
  const sentryUserId = sessionUser?.id ?? "";
  const [input, setInput] = useState("");
  const [messageMentions, setMessageMentions] = useState<Link[][]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [flowError, setFlowError] = useState<ChatFlowError | null>(null);
  const chatIdRef = useRef(chatId);
  const mentionsRef = useRef(mentions);
  const inputRef = useRef("");
  const needsInitialRestoreRef = useRef(true);
  const loadAbortRef = useRef<AbortController | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);
  const messagesForSnapshotRef = useRef<UIMessage[]>([]);
  const messageMentionsForSnapshotRef = useRef<Link[][]>([]);
  const chatTitleForSnapshotRef = useRef<string | null>(null);
  /** When true, a valid `data-chat-protocol-error` already drove UX for this send. */
  const protocolStreamErrorHandledRef = useRef(false);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    mentionsRef.current = mentions;
  }, [mentions]);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const chatFetch = useCallback(
    async (inputReq: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await fetch(inputReq, init);
      if (!res.ok) {
        await throwIfChatErrorResponse(res);
      }
      return res;
    },
    [],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: chatFetch,
      }),
    [chatFetch],
  );

  const { messages, sendMessage, status, setMessages, regenerate, clearError } =
    useChat({
      transport,
      onData: (part) => {
        if (part.type !== "data-chat-protocol-error") return;
        const raw = part.data;
        if (!isChatStreamErrorPayload(raw)) {
          Sentry.captureMessage("Invalid chat stream protocol error payload", {
            level: "warning",
            tags: {
              phase: "client_stream_data",
              chatId: chatIdRef.current ?? "",
              userId: sentryUserId,
            },
          });
          return;
        }
        Sentry.captureMessage("Chat stream protocol error", {
          level: "error",
          tags: {
            phase: "client_stream_data",
            chatId: chatIdRef.current ?? "",
            userId: sentryUserId,
            code: raw.code,
            tool: raw.tool ?? "",
          },
          extra: { retryAfterSeconds: raw.retryAfterSeconds },
        });
        const flow = chatFlowErrorFromStreamPayload(raw);
        if (flow.kind === "missing_chat") {
          toast.error("This chat is no longer available.");
          const goneId = chatIdRef.current;
          if (goneId) clearChatSnapshot(goneId);
          setChatId(null);
          setChatTitle(null);
          setMessages([]);
          setMessageMentions([]);
          clearMentions();
        }
        setFlowError(flow);
        protocolStreamErrorHandledRef.current = true;
      },
      onError: (err) => {
        if (isChatRequestError(err)) {
          Sentry.captureException(err, {
            tags: {
              chatId: chatIdRef.current ?? "",
              userId: sentryUserId,
              phase: "client_send",
            },
          });
          const flow = chatFlowErrorFromRequestError(err);
          if (flow.kind === "missing_chat") {
            toast.error("This chat is no longer available.");
            const goneId = chatIdRef.current;
            if (goneId) clearChatSnapshot(goneId);
            setChatId(null);
            setChatTitle(null);
            setMessages([]);
            setMessageMentions([]);
            clearMentions();
          }
          setFlowError(flow);
          return;
        }
        if (protocolStreamErrorHandledRef.current) {
          Sentry.captureMessage("Chat transport error after protocol error handled", {
            level: "info",
            tags: {
              chatId: chatIdRef.current ?? "",
              userId: sentryUserId,
              phase: "client_send",
              errorSource: "sdk_transport",
              skippedReason: "protocol_error_already_handled",
            },
          });
          return;
        }
        Sentry.captureException(err, {
          tags: {
            chatId: chatIdRef.current ?? "",
            userId: sentryUserId,
            phase: "client_send",
          },
        });
        setFlowError({
          kind: "retry",
          message: err.message || "Something went wrong. Please try again.",
        });
      },
      onFinish: ({ isError }) => {
        if (isError) {
          if (protocolStreamErrorHandledRef.current) {
            Sentry.captureMessage("Chat stream SDK finish after protocol error handled", {
              level: "info",
              tags: {
                chatId: chatIdRef.current ?? "",
                userId: sentryUserId,
                phase: "client_stream",
                skippedReason: "protocol_error_already_handled",
                errorSource: "sdk_finish",
              },
            });
            return;
          }
          Sentry.captureMessage("Chat stream finished with error", {
            level: "error",
            tags: {
              chatId: chatIdRef.current ?? "",
              userId: sentryUserId,
              phase: "client_stream",
            },
          });
          setFlowError({
            kind: "retry",
            message: "Something went wrong. Try again.",
          });
          return;
        }
        clearError();
        setFlowError((prev) => (prev?.kind === "session" ? prev : null));
      },
    });

  useEffect(() => {
    if (status === "submitted") {
      protocolStreamErrorHandledRef.current = false;
    }
  }, [status]);

  const isLoading = status === "submitted" || status === "streaming";

  useLayoutEffect(() => {
    if (!chatId) return;
    const snap = getChatSnapshot(chatId);
    if (!snap?.messages.length) return;
    setMessages(snap.messages as UIMessage[]);
    setMessageMentions(snap.messageMentions);
    setChatTitle(snap.title);
  }, [chatId, setMessages, setChatTitle]);

  useEffect(() => {
    messagesForSnapshotRef.current = messages;
    messageMentionsForSnapshotRef.current = messageMentions;
    chatTitleForSnapshotRef.current = chatTitle;
  }, [messages, messageMentions, chatTitle]);

  useEffect(() => {
    if (!chatId) return;
    const t = window.setTimeout(() => {
      setChatSnapshot(chatId, {
        v: 1,
        title: chatTitle,
        messages: messages as unknown[],
        messageMentions,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [messages, messageMentions, chatId, chatTitle]);

  useEffect(() => {
    return () => {
      const id = chatIdRef.current;
      if (!id) return;
      setChatSnapshot(id, {
        v: 1,
        title: chatTitleForSnapshotRef.current,
        messages: messagesForSnapshotRef.current as unknown[],
        messageMentions: messageMentionsForSnapshotRef.current,
      });
    };
  }, []);

  const dismissFlowError = useCallback(() => {
    clearError();
    setFlowError(null);
  }, [clearError]);

  const handleRetrySend = useCallback(() => {
    clearError();
    setFlowError(null);
    void regenerate();
  }, [clearError, regenerate]);

  const syncChatFromServer = useCallback(
    async (id: string) => {
      const previousId = chatIdRef.current;
      if (previousId !== id) {
        setDraft(previousId ?? DRAFT_NEW_CHAT_KEY, inputRef.current);
      }

      loadAbortRef.current?.abort();
      const ac = new AbortController();
      loadAbortRef.current = ac;

      const cached = getChatSnapshot(id);
      const hasUiCache = Boolean(cached && cached.messages.length > 0);

      if (hasUiCache) {
        setMessages(cached!.messages as UIMessage[]);
        setMessageMentions(cached!.messageMentions);
        setChatTitle(cached!.title);
        setChatId(id);
        setIsLoadingChat(false);
      } else {
        setIsLoadingChat(true);
        setChatId(id);
        setMessages([]);
        setMessageMentions([]);
      }

      try {
        const result = await loadChatFromApi(id, ac.signal);
        if (ac.signal.aborted) return;

        if (!result.ok) {
          if (result.aborted) return;

          if (result.status === 404) {
            toast.error("This chat is no longer available.");
            clearChatSnapshot(id);
            setChatId(null);
            setChatTitle(null);
            setMessages([]);
            setMessageMentions([]);
            clearMentions();
            return;
          }

          if (result.status === 401) {
            setFlowError({ kind: "session" });
            Sentry.captureMessage("Chat load unauthorized", {
              level: "warning",
              tags: {
                chatId: id,
                userId: sentryUserId,
                phase: "client_load_chat",
              },
            });
            return;
          }

          if (result.status === 429) {
            setFlowError(
              chatFlowErrorFromHttp(result.status, result.parsed),
            );
            return;
          }

          const err =
            result.status >= 500 || result.status === 0
              ? new Error(`load chat failed: ${result.status}`)
              : new Error(`load chat failed: ${result.status}`);
          Sentry.captureException(err, {
            tags: {
              chatId: id,
              userId: sentryUserId,
              phase: "client_load_chat",
            },
            extra: { status: result.status, parsed: result.parsed },
          });
          setFlowError(
            chatFlowErrorFromHttp(result.status, result.parsed),
          );
          return;
        }

        const payload = result.payload;
        setFlowError(null);
        setMessages(payload.messages);
        setMessageMentions(payload.messageMentions);
        setChatId(payload.id);
        setChatTitle(payload.title);
        clearMentions();

        setChatSnapshot(id, {
          v: 1,
          title: payload.title,
          messages: payload.messages as unknown[],
          messageMentions: payload.messageMentions,
        });
      } finally {
        setIsLoadingChat(false);
      }
    },
    [setChatId, setChatTitle, setMessages, clearMentions, sentryUserId],
  );

  const wasLoadingRef = useRef(false);
  const summarizeInFlightRef = useRef(false);
  /** Dedupes React Strict Mode's double effect run for the same pending summarize link id. */
  const summarizeHandledLinkIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && chatId) {
      void (async () => {
        try {
          const res = await fetch(`/api/chats/${chatId}`);
          if (res.status === 401) {
            setFlowError({ kind: "session" });
            return;
          }
          if (!res.ok) return;
          const data = (await res.json()) as { title?: string | null };
          const next =
            typeof data.title === "string" && data.title.trim()
              ? data.title.trim()
              : null;
          setChatTitle(next);
        } catch {
          /* network — ignore title refresh */
        }
      })();
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, chatId, setChatTitle]);

  useEffect(() => {
    if (!needsInitialRestoreRef.current) return;
    const id = chatId;
    if (!id) {
      needsInitialRestoreRef.current = false;
      return;
    }
    if (pendingSummarize) {
      // Do not hydrate from the server in parallel with summarize sendMessage (sync replaces messages).
      needsInitialRestoreRef.current = false;
      return;
    }
    needsInitialRestoreRef.current = false;
    void syncChatFromServer(id);
  }, [chatId, syncChatFromServer, pendingSummarize]);

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const key = chatId ?? DRAFT_NEW_CHAT_KEY;
    setInput(getDraft(key));
  }, [chatId]);

  useEffect(() => {
    const key = chatId ?? DRAFT_NEW_CHAT_KEY;
    const t = window.setTimeout(() => {
      setDraft(key, input);
    }, 300);
    return () => window.clearTimeout(t);
  }, [input, chatId]);

  useEffect(() => {
    if (!pendingSummarize) {
      summarizeHandledLinkIdRef.current = null;
      return;
    }
    if (summarizeInFlightRef.current) return;
    if (summarizeHandledLinkIdRef.current === pendingSummarize.id) return;

    summarizeInFlightRef.current = true;
    summarizeHandledLinkIdRef.current = pendingSummarize.id;
    const link = pendingSummarize;
    clearPendingSummarize();

    void (async () => {
      try {
        let id = chatIdRef.current;
        if (!id) {
          try {
            id = await createNewChat();
          } catch (e) {
            if (isChatRequestError(e)) {
              setFlowError(chatFlowErrorFromRequestError(e));
              Sentry.captureException(e, {
                tags: { phase: "client_create_chat", userId: sentryUserId },
              });
            } else {
              Sentry.captureException(e, {
                tags: { phase: "client_create_chat", userId: sentryUserId },
              });
              setFlowError({
                kind: "retry",
                message: "Could not start a chat.",
              });
            }
            return;
          }
        }

        const requestId = newRequestId();
        lastRequestIdRef.current = requestId;
        sendMessage(
          { text: `Summarize @${link.title}` },
          {
            body: {
              chatId: id,
              mentionedLinkIds: [link.id],
              requestId,
            },
          },
        );
        setMessageMentions((prev) => [...prev, [link]]);
      } finally {
        summarizeInFlightRef.current = false;
      }
    })();
  }, [
    pendingSummarize,
    clearPendingSummarize,
    createNewChat,
    sendMessage,
    sentryUserId,
  ]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text) return;

      let id = chatIdRef.current;
      if (!id) {
        const newDraft = getDraft(DRAFT_NEW_CHAT_KEY);
        try {
          id = await createNewChat();
        } catch (err) {
          if (isChatRequestError(err)) {
            setFlowError(chatFlowErrorFromRequestError(err));
            Sentry.captureException(err, {
              tags: { phase: "client_create_chat", userId: sentryUserId },
            });
          } else {
            Sentry.captureException(err, {
              tags: { phase: "client_create_chat", userId: sentryUserId },
            });
            setFlowError({
              kind: "retry",
              message: "Could not start a chat.",
            });
          }
          return;
        }
        if (newDraft) {
          setDraft(id, newDraft);
          clearDraft(DRAFT_NEW_CHAT_KEY);
        }
      }

      const mentionedLinkIds = mentionsRef.current.map((m) => m.id);
      const requestId = newRequestId();
      lastRequestIdRef.current = requestId;
      sendMessage(
        { text },
        { body: { chatId: id, mentionedLinkIds, requestId } },
      );
      setMessageMentions((prev) => [...prev, [...mentionsRef.current]]);
      clearDraft(id);
      clearDraft(DRAFT_NEW_CHAT_KEY);
      setInput("");
      clearMentions();
    },
    [input, createNewChat, sendMessage, clearMentions, sentryUserId],
  );

  const handleSuggestion = useCallback(
    async (text: string) => {
      let id = chatIdRef.current;
      if (!id) {
        try {
          id = await createNewChat();
        } catch (err) {
          if (isChatRequestError(err)) {
            setFlowError(chatFlowErrorFromRequestError(err));
            Sentry.captureException(err, {
              tags: { phase: "client_create_chat", userId: sentryUserId },
            });
          } else {
            Sentry.captureException(err, {
              tags: { phase: "client_create_chat", userId: sentryUserId },
            });
            setFlowError({
              kind: "retry",
              message: "Could not start a chat.",
            });
          }
          return;
        }
      }

      const requestId = newRequestId();
      lastRequestIdRef.current = requestId;
      sendMessage({ text }, { body: { chatId: id, requestId } });
      setMessageMentions((prev) => [...prev, []]);
    },
    [createNewChat, sendMessage, sentryUserId],
  );

  const handleNewChat = useCallback(() => {
    const prev = chatIdRef.current;
    if (prev) clearDraft(prev);
    clearDraft(DRAFT_NEW_CHAT_KEY);
    startNewChat();
    setMessages([]);
    setMessageMentions([]);
    setInput("");
    clearError();
    setFlowError(null);
  }, [startNewChat, setMessages, clearError]);

  const handleSelectChat = useCallback(
    async (id: string) => {
      await syncChatFromServer(id);
    },
    [syncChatFromServer],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-start md:w-96">
      <ChatHeader
        title={chatTitle}
        onClose={onClose}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        isLoadingChat={isLoadingChat}
        flowError={flowError}
        onDismissFlowError={dismissFlowError}
        onRetrySend={handleRetrySend}
      />
      <ChatArea
        messages={messages}
        messageMentions={messageMentions}
        isLoading={isLoading}
        isLoadingChat={isLoadingChat}
        onSuggestion={handleSuggestion}
        userAvatarUrl={sessionUser?.image}
        userDisplayName={sessionUser?.name}
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
