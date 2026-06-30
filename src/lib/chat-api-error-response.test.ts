import { describe, expect, it } from "vitest";
import { CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { chatJsonError } from "./chat-api-error-response";

describe("chatJsonError", () => {
  it("returns a JSON body with the given status and error code", async () => {
    const res = chatJsonError(
      404,
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Chat not found.",
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: {
        code: "CHAT_NOT_FOUND",
        message: "Chat not found.",
      },
    });
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("sets Retry-After when retryAfterSeconds is provided", async () => {
    const res = chatJsonError(
      429,
      CHAT_ERROR_CODES.RATE_LIMITED,
      "Slow down.",
      { retryAfterSeconds: 45, feature: "chat" },
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = await res.json();
    expect(body.error.retryAfterSeconds).toBe(45);
    expect(body.error.feature).toBe("chat");
  });

  it("omits Retry-After when retryAfterSeconds is not provided", () => {
    const res = chatJsonError(
      500,
      CHAT_ERROR_CODES.INTERNAL_ERROR,
      "Server error.",
    );

    expect(res.headers.get("Retry-After")).toBeNull();
  });
});
