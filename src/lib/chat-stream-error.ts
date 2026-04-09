import type { ChatFlowError } from "@/lib/chat-flow-error";
import {
  CHAT_ERROR_CODES,
  CHAT_STREAM_ERROR_CODES,
  type ChatStreamErrorCode,
} from "@/lib/chat-http-errors";
import type { UIMessage } from "ai";

/** Safe fields only — no provider or DB internals. */
export type ChatStreamToolName = "listSavedItems" | "searchContent";

export type ChatStreamErrorPayload = {
  code: ChatStreamErrorCode;
  userMessage: string;
  tool?: ChatStreamToolName;
  retryAfterSeconds?: number;
};

export type PurlChatUIMessage = UIMessage<
  unknown,
  { "chat-protocol-error": ChatStreamErrorPayload }
>;

const CHAT_STREAM_CODES = new Set<string>([
  ...Object.values(CHAT_ERROR_CODES),
  ...Object.values(CHAT_STREAM_ERROR_CODES),
]);

export function isChatStreamErrorPayload(
  value: unknown,
): value is ChatStreamErrorPayload {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.code !== "string" || !CHAT_STREAM_CODES.has(o.code)) {
    return false;
  }
  if (typeof o.userMessage !== "string") return false;
  if (
    o.tool !== undefined &&
    o.tool !== "listSavedItems" &&
    o.tool !== "searchContent"
  ) {
    return false;
  }
  if (
    o.retryAfterSeconds !== undefined &&
    typeof o.retryAfterSeconds !== "number"
  ) {
    return false;
  }
  return true;
}

export function chatFlowErrorFromStreamPayload(
  payload: ChatStreamErrorPayload,
): ChatFlowError {
  if (payload.code === CHAT_ERROR_CODES.SESSION_EXPIRED) {
    return { kind: "session" };
  }
  if (payload.code === CHAT_ERROR_CODES.CHAT_NOT_FOUND) {
    return { kind: "missing_chat" };
  }
  if (payload.code === CHAT_ERROR_CODES.RATE_LIMITED) {
    const sec = payload.retryAfterSeconds ?? 60;
    return { kind: "rate_limit", untilMs: Date.now() + sec * 1000 };
  }
  const msg = payload.userMessage.trim();
  return {
    kind: "retry",
    message: msg || "Something went wrong. Please try again.",
  };
}
