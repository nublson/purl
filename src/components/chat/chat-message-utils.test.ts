import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { getMessageText } from "./chat-message-utils";

function makeMessage(parts: UIMessage["parts"]): UIMessage {
  return {
    id: "m1",
    role: "user",
    parts,
  };
}

describe("getMessageText", () => {
  it("joins text parts in order", () => {
    const message = makeMessage([
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ]);

    expect(getMessageText(message)).toBe("Hello world");
  });

  it("ignores non-text parts", () => {
    const message = makeMessage([
      { type: "text", text: "Visible" },
      { type: "tool-invocation", toolInvocation: { toolName: "search", state: "call" } } as never,
      { type: "text", text: " text" },
    ]);

    expect(getMessageText(message)).toBe("Visible text");
  });

  it("returns an empty string when parts is undefined", () => {
    const message = { id: "m1", role: "assistant" } as UIMessage;

    expect(getMessageText(message)).toBe("");
  });

  it("returns an empty string when there are no text parts", () => {
    const message = makeMessage([]);

    expect(getMessageText(message)).toBe("");
  });
});
