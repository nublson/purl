import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getChatModel: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { linkContent: { findMany: vi.fn() } },
}));

vi.mock("@/lib/semantic-search", () => ({
  semanticSearch: vi.fn(),
}));

const { streamText } = await import("ai");
const { getChatModel } = await import("@/lib/ai");
const { streamChatResponse } = await import("./chat");

describe("streamChatResponse", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
    vi.mocked(getChatModel).mockReset();
  });

  it("delegates to AI SDK streamText with system prompt and messages", () => {
    const model = { id: "chat-model" };
    const messages = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
    const streamResult = { toDataStreamResponse: vi.fn() };

    vi.mocked(getChatModel).mockReturnValue(model as never);
    vi.mocked(streamText).mockReturnValue(streamResult as never);

    const result = streamChatResponse(messages as never, null);

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        messages,
        system: expect.stringContaining("Purl AI"),
      }),
    );
    expect(result).toEqual(streamResult);
  });

  it("includes context in system prompt when provided", () => {
    const model = { id: "chat-model" };
    const messages = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
    const context = "### Article\nSource: https://example.com\n\nSome content";

    vi.mocked(getChatModel).mockReturnValue(model as never);
    vi.mocked(streamText).mockReturnValue({} as never);

    streamChatResponse(messages as never, context);

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Relevant saved content"),
      }),
    );
  });
});
