import { describe, expect, it } from "vitest";
import {
  buildChatErrorBody,
  CHAT_ERROR_CODES,
  isChatErrorBody,
  parseChatErrorBody,
} from "./chat-http-errors";

describe("chat-http-errors", () => {
  it("buildChatErrorBody includes optional retryAfterSeconds", () => {
    expect(buildChatErrorBody(CHAT_ERROR_CODES.RATE_LIMITED, "Slow down", 30)).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Slow down",
        retryAfterSeconds: 30,
      },
    });
  });

  it("parseChatErrorBody round-trips", () => {
    const body = buildChatErrorBody(
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Missing",
    );
    expect(isChatErrorBody(body)).toBe(true);
    expect(parseChatErrorBody(body)).toEqual({
      code: "CHAT_NOT_FOUND",
      message: "Missing",
      retryAfterSeconds: undefined,
    });
  });

  it("parseChatErrorBody returns null for legacy shape", () => {
    expect(parseChatErrorBody({ error: "Unauthorized" })).toBeNull();
  });
});
