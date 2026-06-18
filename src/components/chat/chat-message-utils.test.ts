import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { getMessageText } from "./chat-message-utils";

describe("getMessageText", () => {
  it("joins text parts from an AI SDK UIMessage", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ],
    } as UIMessage;

    expect(getMessageText(message)).toBe("Hello world");
  });

  it("ignores non-text parts such as tool invocations", () => {
    const message = {
      id: "m2",
      role: "assistant",
      parts: [
        { type: "text", text: "Done." },
        { type: "tool-invocation", toolInvocation: { toolName: "search" } },
      ],
    } as unknown as UIMessage;

    expect(getMessageText(message)).toBe("Done.");
  });

  it("returns an empty string when parts are missing or empty", () => {
    expect(getMessageText({ id: "m3", role: "user", parts: [] } as UIMessage)).toBe(
      "",
    );
    expect(getMessageText({ id: "m4", role: "user" } as UIMessage)).toBe("");
  });
});
