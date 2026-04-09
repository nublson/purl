/** Shared chat API error contract — safe to import from client or server. */

/** Returned only in pre-stream JSON error bodies (4xx/5xx before SSE). */
export const CHAT_HTTP_ERROR_CODES = {
  SESSION_EXPIRED: "SESSION_EXPIRED",
  CHAT_NOT_FOUND: "CHAT_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  BAD_REQUEST: "BAD_REQUEST",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/** Transient `data-chat-protocol-error` parts only — never use in `chatJsonError`. */
export const CHAT_STREAM_ERROR_CODES = {
  TOOL_FAILED: "TOOL_FAILED",
  STREAM_FAILED: "STREAM_FAILED",
} as const;

/** Alias: HTTP JSON responses only (same as [`CHAT_HTTP_ERROR_CODES`]). */
export const CHAT_ERROR_CODES = CHAT_HTTP_ERROR_CODES;

export type ChatHttpErrorCode =
  (typeof CHAT_HTTP_ERROR_CODES)[keyof typeof CHAT_HTTP_ERROR_CODES];

export type ChatStreamOnlyErrorCode =
  (typeof CHAT_STREAM_ERROR_CODES)[keyof typeof CHAT_STREAM_ERROR_CODES];

export type ChatStreamErrorCode = ChatHttpErrorCode | ChatStreamOnlyErrorCode;

/** Same as [`ChatHttpErrorCode`] — pre-stream JSON only. */
export type ChatErrorCode = ChatHttpErrorCode;

export type ChatErrorBody = {
  error: {
    code: ChatHttpErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
};

export function buildChatErrorBody(
  code: ChatHttpErrorCode,
  message: string,
  retryAfterSeconds?: number,
): ChatErrorBody {
  const body: ChatErrorBody = {
    error: { code, message },
  };
  if (retryAfterSeconds != null) {
    body.error.retryAfterSeconds = retryAfterSeconds;
  }
  return body;
}

/** Structural check only; `code` may be any string from the wire for forward compatibility. */
export function isChatErrorBody(value: unknown): value is ChatErrorBody {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const err = o.error;
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return (
    typeof e.code === "string" &&
    typeof e.message === "string" &&
    (e.retryAfterSeconds === undefined || typeof e.retryAfterSeconds === "number")
  );
}

export type ParsedChatError = {
  code: ChatHttpErrorCode | string;
  message: string;
  retryAfterSeconds?: number;
};

export function parseChatErrorBody(body: unknown): ParsedChatError | null {
  if (!isChatErrorBody(body)) return null;
  return {
    code: body.error.code,
    message: body.error.message,
    retryAfterSeconds: body.error.retryAfterSeconds,
  };
}

/** Thrown by chat transport when POST /api/chat returns a non-OK JSON body. */
export class ChatRequestError extends Error {
  readonly status: number;
  readonly code: ChatHttpErrorCode | string;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: ChatHttpErrorCode | string,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isChatRequestError(e: unknown): e is ChatRequestError {
  return e instanceof ChatRequestError;
}

export async function parseChatErrorFromResponse(
  response: Response,
): Promise<ParsedChatError | null> {
  const ct = response.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  try {
    const data: unknown = await response.json();
    return parseChatErrorBody(data);
  } catch {
    return null;
  }
}

function parseRetryAfterHeader(header: string | null): number | undefined {
  if (header == null || header === "") return undefined;
  const n = parseInt(header, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** After a non-OK response, read JSON error or throw with status only. */
export async function throwIfChatErrorResponse(
  response: Response,
): Promise<void> {
  if (response.ok) return;
  const parsed = await parseChatErrorFromResponse(response.clone());
  const headerRetry = parseRetryAfterHeader(response.headers.get("Retry-After"));
  if (parsed) {
    throw new ChatRequestError(
      response.status,
      parsed.code,
      parsed.message,
      parsed.retryAfterSeconds ?? headerRetry,
    );
  }
  throw new ChatRequestError(
    response.status,
    CHAT_HTTP_ERROR_CODES.INTERNAL_ERROR,
    response.statusText || "Request failed",
    headerRetry,
  );
}
