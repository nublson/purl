import { describe, expect, it } from "vitest";
import {
  buildChatErrorBody,
  CHAT_ERROR_CODES,
  ChatRequestError,
  isChatErrorBody,
  isChatRequestError,
  parseChatErrorBody,
  parseChatErrorFromResponse,
  throwIfChatErrorResponse,
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

  it("buildChatErrorBody omits retryAfterSeconds when not provided", () => {
    const body = buildChatErrorBody(CHAT_ERROR_CODES.BAD_REQUEST, "Bad");
    expect(body.error.retryAfterSeconds).toBeUndefined();
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

  it("isChatErrorBody returns false for a non-object", () => {
    expect(isChatErrorBody("string")).toBe(false);
    expect(isChatErrorBody(null)).toBe(false);
    expect(isChatErrorBody(undefined)).toBe(false);
  });

  it("isChatErrorBody returns false when code is not a string", () => {
    expect(isChatErrorBody({ error: { code: 42, message: "x" } })).toBe(false);
  });

  it("isChatErrorBody returns false when retryAfterSeconds is a string", () => {
    expect(
      isChatErrorBody({
        error: { code: "A", message: "x", retryAfterSeconds: "30" },
      }),
    ).toBe(false);
  });

  it("isChatErrorBody returns true when retryAfterSeconds is a number", () => {
    expect(
      isChatErrorBody({
        error: { code: "A", message: "x", retryAfterSeconds: 30 },
      }),
    ).toBe(true);
  });
});

describe("ChatRequestError", () => {
  it("stores status, code, message, and retryAfterSeconds", () => {
    const err = new ChatRequestError(429, "RATE_LIMITED", "Slow down", 60);
    expect(err.status).toBe(429);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.message).toBe("Slow down");
    expect(err.retryAfterSeconds).toBe(60);
    expect(err.name).toBe("ChatRequestError");
  });

  it("retryAfterSeconds is undefined when not provided", () => {
    const err = new ChatRequestError(500, "INTERNAL_ERROR", "Boom");
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new ChatRequestError(401, "SESSION_EXPIRED", "Expired");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChatRequestError);
  });
});

describe("isChatRequestError", () => {
  it("returns true for a ChatRequestError instance", () => {
    expect(
      isChatRequestError(new ChatRequestError(500, "INTERNAL_ERROR", "x")),
    ).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isChatRequestError(new Error("plain"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isChatRequestError(null)).toBe(false);
  });
});

describe("parseChatErrorFromResponse", () => {
  it("returns null when content-type is not JSON", async () => {
    const res = new Response("<html>error</html>", {
      status: 503,
      headers: { "content-type": "text/html" },
    });
    expect(await parseChatErrorFromResponse(res)).toBeNull();
  });

  it("returns null when JSON body does not match ChatErrorBody shape", async () => {
    const res = new Response(JSON.stringify({ message: "oops" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    expect(await parseChatErrorFromResponse(res)).toBeNull();
  });

  it("parses a valid ChatErrorBody from the response", async () => {
    const body = buildChatErrorBody(CHAT_ERROR_CODES.BAD_REQUEST, "Bad input");
    const res = new Response(JSON.stringify(body), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    const parsed = await parseChatErrorFromResponse(res);
    expect(parsed).toEqual({
      code: "BAD_REQUEST",
      message: "Bad input",
      retryAfterSeconds: undefined,
    });
  });

  it("returns null when JSON.parse throws (malformed body)", async () => {
    const res = new Response("{bad json}", {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    expect(await parseChatErrorFromResponse(res)).toBeNull();
  });
});

describe("throwIfChatErrorResponse", () => {
  it("does not throw for an ok response", async () => {
    const res = new Response(null, { status: 200 });
    await expect(throwIfChatErrorResponse(res)).resolves.toBeUndefined();
  });

  it("throws ChatRequestError with parsed body code for a structured error response", async () => {
    const body = buildChatErrorBody(
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Chat not found",
    );
    const res = new Response(JSON.stringify(body), {
      status: 404,
      headers: { "content-type": "application/json" },
    });

    await expect(throwIfChatErrorResponse(res)).rejects.toMatchObject({
      status: 404,
      code: "CHAT_NOT_FOUND",
      message: "Chat not found",
    });
  });

  it("throws ChatRequestError with INTERNAL_ERROR when body is not a valid error shape", async () => {
    const res = new Response(null, {
      status: 503,
      statusText: "Service Unavailable",
    });

    await expect(throwIfChatErrorResponse(res)).rejects.toMatchObject({
      status: 503,
      code: CHAT_ERROR_CODES.INTERNAL_ERROR,
    });
  });

  it("prefers retryAfterSeconds from body over Retry-After header", async () => {
    const body = buildChatErrorBody(
      CHAT_ERROR_CODES.RATE_LIMITED,
      "Slow down",
      30,
    );
    const res = new Response(JSON.stringify(body), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "Retry-After": "60",
      },
    });

    await expect(throwIfChatErrorResponse(res)).rejects.toMatchObject({
      retryAfterSeconds: 30,
    });
  });

  it("falls back to Retry-After header when body has no retryAfterSeconds", async () => {
    const body = buildChatErrorBody(CHAT_ERROR_CODES.RATE_LIMITED, "Slow");
    const res = new Response(JSON.stringify(body), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "Retry-After": "45",
      },
    });

    await expect(throwIfChatErrorResponse(res)).rejects.toMatchObject({
      retryAfterSeconds: 45,
    });
  });
});
