import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getChatModel: vi.fn(),
}));

const { generateText } = await import("ai");
const { getChatModel } = await import("@/lib/ai");
const { generateChatResponse } = await import("./chat");

describe("generateChatResponse", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(getChatModel).mockReset();
  });

  it("delegates to AI SDK generateText with shared chat model", async () => {
    const model = { id: "chat-model" };
    const messages = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
    const response = { text: "Hello back" };

    vi.mocked(getChatModel).mockReturnValue(model as never);
    vi.mocked(generateText).mockResolvedValue(response as never);

    const result = await generateChatResponse(messages as never);

    expect(generateText).toHaveBeenCalledWith({
      model,
      messages,
    });
    expect(result).toEqual(response);
  });
});
