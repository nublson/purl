import { describe, expect, it } from "vitest";
import {
  CHAT_ERROR_CODES,
  CHAT_STREAM_ERROR_CODES,
} from "./chat-http-errors";
import {
  chatFlowErrorFromStreamPayload,
  isChatStreamErrorPayload,
} from "./chat-stream-error";

describe("isChatStreamErrorPayload", () => {
  it("returns true for a minimal valid payload", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_STREAM_ERROR_CODES.TOOL_FAILED,
        userMessage: "Something went wrong",
      }),
    ).toBe(true);
  });

  it("returns true for a payload with all optional fields", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_STREAM_ERROR_CODES.STREAM_FAILED,
        userMessage: "Stream error",
        tool: "listSavedItems",
        retryAfterSeconds: 30,
      }),
    ).toBe(true);
  });

  it("returns true for HTTP error codes inside a stream payload", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_ERROR_CODES.RATE_LIMITED,
        userMessage: "Too many requests",
      }),
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(isChatStreamErrorPayload(null)).toBe(false);
  });

  it("returns false for a non-object primitive", () => {
    expect(isChatStreamErrorPayload("TOOL_FAILED")).toBe(false);
    expect(isChatStreamErrorPayload(42)).toBe(false);
  });

  it("returns false when code is missing", () => {
    expect(
      isChatStreamErrorPayload({ userMessage: "Missing code" }),
    ).toBe(false);
  });

  it("returns false when code is an unknown string", () => {
    expect(
      isChatStreamErrorPayload({
        code: "UNKNOWN_ERROR_CODE",
        userMessage: "x",
      }),
    ).toBe(false);
  });

  it("returns false when userMessage is not a string", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_STREAM_ERROR_CODES.TOOL_FAILED,
        userMessage: 42,
      }),
    ).toBe(false);
  });

  it("returns false when tool is an invalid value", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_STREAM_ERROR_CODES.TOOL_FAILED,
        userMessage: "err",
        tool: "unknownTool",
      }),
    ).toBe(false);
  });

  it("returns false when retryAfterSeconds is not a number", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_STREAM_ERROR_CODES.STREAM_FAILED,
        userMessage: "err",
        retryAfterSeconds: "30",
      }),
    ).toBe(false);
  });

  it("accepts searchContent as a valid tool name", () => {
    expect(
      isChatStreamErrorPayload({
        code: CHAT_STREAM_ERROR_CODES.TOOL_FAILED,
        userMessage: "err",
        tool: "searchContent",
      }),
    ).toBe(true);
  });
});

describe("chatFlowErrorFromStreamPayload", () => {
  it("returns session kind for SESSION_EXPIRED code", () => {
    expect(
      chatFlowErrorFromStreamPayload({
        code: CHAT_ERROR_CODES.SESSION_EXPIRED,
        userMessage: "",
      }),
    ).toEqual({ kind: "session" });
  });

  it("returns missing_chat kind for CHAT_NOT_FOUND code", () => {
    expect(
      chatFlowErrorFromStreamPayload({
        code: CHAT_ERROR_CODES.CHAT_NOT_FOUND,
        userMessage: "",
      }),
    ).toEqual({ kind: "missing_chat" });
  });

  it("returns rate_limit kind for RATE_LIMITED code with default 60s window", () => {
    const before = Date.now();
    const result = chatFlowErrorFromStreamPayload({
      code: CHAT_ERROR_CODES.RATE_LIMITED,
      userMessage: "",
    });
    const after = Date.now();

    expect(result.kind).toBe("rate_limit");
    if (result.kind === "rate_limit") {
      expect(result.untilMs).toBeGreaterThanOrEqual(before + 60_000);
      expect(result.untilMs).toBeLessThanOrEqual(after + 60_000);
    }
  });

  it("returns rate_limit with retryAfterSeconds when provided", () => {
    const before = Date.now();
    const result = chatFlowErrorFromStreamPayload({
      code: CHAT_ERROR_CODES.RATE_LIMITED,
      userMessage: "",
      retryAfterSeconds: 120,
    });
    const after = Date.now();

    expect(result.kind).toBe("rate_limit");
    if (result.kind === "rate_limit") {
      expect(result.untilMs).toBeGreaterThanOrEqual(before + 120_000);
      expect(result.untilMs).toBeLessThanOrEqual(after + 120_000);
    }
  });

  it("returns quota_exceeded kind for QUOTA_EXCEEDED code", () => {
    expect(
      chatFlowErrorFromStreamPayload({
        code: CHAT_STREAM_ERROR_CODES.QUOTA_EXCEEDED,
        userMessage: "Out of credits",
      }),
    ).toEqual({ kind: "quota_exceeded" });
  });

  it("returns retry kind with userMessage for TOOL_FAILED code", () => {
    expect(
      chatFlowErrorFromStreamPayload({
        code: CHAT_STREAM_ERROR_CODES.TOOL_FAILED,
        userMessage: "Tool blew up",
      }),
    ).toEqual({ kind: "retry", message: "Tool blew up" });
  });

  it("returns retry kind with fallback message when userMessage is blank", () => {
    expect(
      chatFlowErrorFromStreamPayload({
        code: CHAT_STREAM_ERROR_CODES.STREAM_FAILED,
        userMessage: "   ",
      }),
    ).toEqual({
      kind: "retry",
      message: "Something went wrong. Please try again.",
    });
  });
});
