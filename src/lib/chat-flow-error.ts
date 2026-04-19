import type { ParsedChatError } from "@/lib/chat-http-errors";
import {
  CHAT_ERROR_CODES,
  type ChatRequestError,
} from "@/lib/chat-http-errors";

/** User-visible chat widget errors (load, send, stream). */
export type ChatFlowError =
  | { kind: "session" }
  | { kind: "missing_chat" }
  | { kind: "rate_limit"; untilMs: number }
  | { kind: "quota_exceeded" }
  | { kind: "retry"; message: string };

export function chatFlowErrorFromHttp(
  status: number,
  parsed: ParsedChatError | null,
): ChatFlowError {
  if (status === 401 || parsed?.code === CHAT_ERROR_CODES.SESSION_EXPIRED) {
    return { kind: "session" };
  }
  if (status === 404 || parsed?.code === CHAT_ERROR_CODES.CHAT_NOT_FOUND) {
    return { kind: "missing_chat" };
  }
  if (status === 429 || parsed?.code === CHAT_ERROR_CODES.RATE_LIMITED) {
    const sec = parsed?.retryAfterSeconds ?? 60;
    return { kind: "rate_limit", untilMs: Date.now() + sec * 1000 };
  }
  return {
    kind: "retry",
    message:
      parsed?.message?.trim() || "Something went wrong. Please try again.",
  };
}

export function chatFlowErrorFromRequestError(
  e: ChatRequestError,
): ChatFlowError {
  return chatFlowErrorFromHttp(e.status, {
    code: e.code,
    message: e.message,
    retryAfterSeconds: e.retryAfterSeconds,
  });
}
