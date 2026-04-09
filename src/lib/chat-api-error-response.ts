import "server-only";

import { NextResponse } from "next/server";
import {
  buildChatErrorBody,
  type ChatHttpErrorCode,
} from "@/lib/chat-http-errors";

export function chatJsonError(
  status: number,
  code: ChatHttpErrorCode,
  message: string,
  options?: { retryAfterSeconds?: number },
): NextResponse {
  const body = buildChatErrorBody(code, message, options?.retryAfterSeconds);
  const headers: Record<string, string> = {};
  if (options?.retryAfterSeconds != null) {
    headers["Retry-After"] = String(options.retryAfterSeconds);
  }
  return NextResponse.json(body, { status, headers });
}
