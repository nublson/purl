import { describe, expect, it } from "vitest";
import { chatFlowErrorFromHttp, chatFlowErrorFromRequestError } from "./chat-flow-error";
import { CHAT_ERROR_CODES, ChatRequestError } from "./chat-http-errors";

describe("chatFlowErrorFromHttp", () => {
  it("returns session kind for 401 status", () => {
    expect(chatFlowErrorFromHttp(401, null)).toEqual({ kind: "session" });
  });

  it("returns session kind when code is SESSION_EXPIRED", () => {
    expect(
      chatFlowErrorFromHttp(200, {
        code: CHAT_ERROR_CODES.SESSION_EXPIRED,
        message: "",
      }),
    ).toEqual({ kind: "session" });
  });

  it("returns missing_chat kind for 404 status", () => {
    expect(chatFlowErrorFromHttp(404, null)).toEqual({ kind: "missing_chat" });
  });

  it("returns missing_chat kind when code is CHAT_NOT_FOUND", () => {
    expect(
      chatFlowErrorFromHttp(200, {
        code: CHAT_ERROR_CODES.CHAT_NOT_FOUND,
        message: "",
      }),
    ).toEqual({ kind: "missing_chat" });
  });

  it("returns rate_limit kind for 429 status with default 60s window", () => {
    const before = Date.now();
    const result = chatFlowErrorFromHttp(429, null);
    const after = Date.now();

    expect(result.kind).toBe("rate_limit");
    if (result.kind === "rate_limit") {
      expect(result.untilMs).toBeGreaterThanOrEqual(before + 60_000);
      expect(result.untilMs).toBeLessThanOrEqual(after + 60_000);
    }
  });

  it("returns rate_limit using retryAfterSeconds from parsed body when available", () => {
    const before = Date.now();
    const result = chatFlowErrorFromHttp(429, {
      code: CHAT_ERROR_CODES.RATE_LIMITED,
      message: "",
      retryAfterSeconds: 30,
    });
    const after = Date.now();

    expect(result.kind).toBe("rate_limit");
    if (result.kind === "rate_limit") {
      expect(result.untilMs).toBeGreaterThanOrEqual(before + 30_000);
      expect(result.untilMs).toBeLessThanOrEqual(after + 30_000);
    }
  });

  it("returns retry kind with parsed message for other status codes", () => {
    const result = chatFlowErrorFromHttp(500, {
      code: CHAT_ERROR_CODES.INTERNAL_ERROR,
      message: "Something exploded",
    });

    expect(result).toEqual({
      kind: "retry",
      message: "Something exploded",
    });
  });

  it("returns retry kind with fallback message when parsed message is empty", () => {
    const result = chatFlowErrorFromHttp(500, {
      code: CHAT_ERROR_CODES.INTERNAL_ERROR,
      message: "   ",
    });

    expect(result).toEqual({
      kind: "retry",
      message: "Something went wrong. Please try again.",
    });
  });

  it("returns retry kind with fallback message when parsed is null and status is not recognized", () => {
    const result = chatFlowErrorFromHttp(503, null);

    expect(result).toEqual({
      kind: "retry",
      message: "Something went wrong. Please try again.",
    });
  });
});

describe("chatFlowErrorFromRequestError", () => {
  it("maps a 401 ChatRequestError to session kind", () => {
    const err = new ChatRequestError(
      401,
      CHAT_ERROR_CODES.SESSION_EXPIRED,
      "Session expired",
    );
    expect(chatFlowErrorFromRequestError(err)).toEqual({ kind: "session" });
  });

  it("maps a 429 ChatRequestError to rate_limit kind with custom retryAfterSeconds", () => {
    const before = Date.now();
    const err = new ChatRequestError(
      429,
      CHAT_ERROR_CODES.RATE_LIMITED,
      "Slow down",
      45,
    );
    const result = chatFlowErrorFromRequestError(err);
    const after = Date.now();

    expect(result.kind).toBe("rate_limit");
    if (result.kind === "rate_limit") {
      expect(result.untilMs).toBeGreaterThanOrEqual(before + 45_000);
      expect(result.untilMs).toBeLessThanOrEqual(after + 45_000);
    }
  });

  it("maps a 500 ChatRequestError to retry kind", () => {
    const err = new ChatRequestError(
      500,
      CHAT_ERROR_CODES.INTERNAL_ERROR,
      "Internal error",
    );
    expect(chatFlowErrorFromRequestError(err)).toEqual({
      kind: "retry",
      message: "Internal error",
    });
  });
});
