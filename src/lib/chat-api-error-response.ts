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
  options?: { retryAfterSeconds?: number; feature?: string },
): NextResponse {
  const body = buildChatErrorBody(code, message, {
    retryAfterSeconds: options?.retryAfterSeconds,
    feature: options?.feature,
  });
  const headers: Record<string, string> = {};
  if (options?.retryAfterSeconds != null) {
    headers["Retry-After"] = String(options.retryAfterSeconds);
  }
  return NextResponse.json(body, { status, headers });
}
