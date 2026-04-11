import { CHAT_STREAM_ERROR_CODES } from "@/lib/chat-http-errors";
import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_CHAT_ID = "chat-test-1";

const stubToolOptions = {} as ToolExecutionOptions;

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

/** AI SDK v6 `tool().execute` takes `(input, options)` and may return a plain value or a Promise. */
async function callToolExecute<I>(
  tool: { execute?: (input: I, options: ToolExecutionOptions) => unknown },
  input: I,
) {
  if (!tool.execute) {
    throw new Error("expected tool.execute to be defined");
  }
  return Promise.resolve(tool.execute(input, stubToolOptions));
}

vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((t: unknown) => t),
  jsonSchema: vi.fn((s: unknown) => s),
  stepCountIs: vi.fn((n: number) => n),
}));

vi.mock("@/lib/ai", () => ({
  getChatModel: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { linkContent: { findMany: vi.fn() }, link: { findMany: vi.fn() } },
}));

vi.mock("@/lib/semantic-search", () => ({
  semanticSearch: vi.fn(),
}));

const { streamText } = await import("ai");
const { getChatModel } = await import("@/lib/ai");
const prisma = (await import("@/lib/prisma")).default;
const { semanticSearch } = await import("@/lib/semantic-search");
const Sentry = await import("@sentry/nextjs");
const { streamChatResponse, buildMentionContext, buildChatTools } =
  await import("./chat");

describe("streamChatResponse", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
    vi.mocked(getChatModel).mockReset();
  });

  it("delegates to AI SDK streamText with system prompt, tools, and messages", () => {
    const model = { id: "chat-model" };
    const messages = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
    const streamResult = { toDataStreamResponse: vi.fn() };

    vi.mocked(getChatModel).mockReturnValue(model as never);
    vi.mocked(streamText).mockReturnValue(streamResult as never);

    const result = streamChatResponse(messages as never, "user-123", null, {
      chatId: TEST_CHAT_ID,
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        messages,
        system: expect.stringContaining("Purl AI"),
        tools: expect.objectContaining({
          listSavedItems: expect.anything(),
          searchContent: expect.anything(),
        }),
        onError: expect.any(Function),
        onFinish: expect.any(Function),
      }),
    );
    expect(result).toEqual(streamResult);
  });

  it("includes mention context in system prompt when provided", () => {
    const model = { id: "chat-model" };
    const messages = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
    const context = "### Article\nSource: https://example.com\n\nSome content";

    vi.mocked(getChatModel).mockReturnValue(model as never);
    vi.mocked(streamText).mockReturnValue({} as never);

    streamChatResponse(messages as never, "user-123", context, {
      chatId: TEST_CHAT_ID,
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("@mentioned items"),
      }),
    );
  });
});

describe("buildMentionContext", () => {
  beforeEach(() => {
    vi.mocked(prisma.linkContent.findMany).mockReset();
  });

  it("returns null immediately for empty mentionedLinkIds without querying the DB", async () => {
    const result = await buildMentionContext("user-1", []);
    expect(result).toBeNull();
    expect(prisma.linkContent.findMany).not.toHaveBeenCalled();
  });

  it("returns null when no linkContent rows are found for the given ids", async () => {
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([] as never);
    const result = await buildMentionContext("user-1", ["id-1"]);
    expect(result).toBeNull();
    expect(prisma.linkContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          linkId: { in: ["id-1"] },
          link: { userId: "user-1" },
        },
      }),
    );
  });

  it("groups multiple chunks for the same link under a single section", async () => {
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      {
        content: "Chunk one",
        link: { title: "My Article", url: "https://example.com/article" },
      },
      {
        content: "Chunk two",
        link: { title: "My Article", url: "https://example.com/article" },
      },
    ] as never);

    const result = await buildMentionContext("user-1", ["id-1"]);

    expect(prisma.linkContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          linkId: { in: ["id-1"] },
          link: { userId: "user-1" },
        },
      }),
    );
    expect(result).toContain("### My Article");
    expect(result).toContain("Source: https://example.com/article");
    expect(result).toContain("Chunk one");
    expect(result).toContain("Chunk two");
    expect(result).not.toContain("---");
  });

  it("separates multiple links with a horizontal rule", async () => {
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      {
        content: "First content",
        link: { title: "Article A", url: "https://a.com" },
      },
      {
        content: "Second content",
        link: { title: "Article B", url: "https://b.com" },
      },
    ] as never);

    const result = await buildMentionContext("user-1", ["id-1", "id-2"]);

    expect(prisma.linkContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          linkId: { in: ["id-1", "id-2"] },
          link: { userId: "user-1" },
        },
      }),
    );
    expect(result).toContain("### Article A");
    expect(result).toContain("### Article B");
    expect(result).toContain("---");
  });
});

describe("buildChatTools – listSavedItems", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.mocked(prisma.link.findMany).mockReset();
    vi.mocked(Sentry.captureException).mockReset();
  });

  it("queries all links for the user with default take=20 when no filters provided", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.listSavedItems, {});

    expect(prisma.link.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        take: 20,
      }),
    );
  });

  it("adds contentType to the where clause when provided", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.listSavedItems, { contentType: "PDF" });

    expect(prisma.link.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contentType: "PDF" }),
      }),
    );
  });

  it("adds dateFrom and dateTo to createdAt filter when provided", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.listSavedItems, {
      dateFrom: "2025-01-01T00:00:00Z",
      dateTo: "2025-01-31T23:59:59Z",
    });

    expect(prisma.link.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2025-01-01T00:00:00Z"),
            lte: new Date("2025-01-31T23:59:59Z"),
          },
        }),
      }),
    );
  });

  it("clamps limit below 1 to 1", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.listSavedItems, { limit: 0 });

    expect(prisma.link.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it("clamps limit above 50 to 50", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.listSavedItems, { limit: 999 });

    expect(prisma.link.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("maps prisma rows to the expected output shape", async () => {
    const createdAt = new Date("2025-06-01T10:00:00Z");
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      {
        id: "l1",
        title: "My Link",
        url: "https://example.com",
        domain: "example.com",
        contentType: "WEB",
        description: "A description",
        createdAt,
      },
    ] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    const result = await callToolExecute(tools.listSavedItems, {});

    expect(result).toEqual([
      {
        title: "My Link",
        url: "https://example.com",
        domain: "example.com",
        contentType: "WEB",
        description: "A description",
        savedAt: createdAt.toISOString(),
      },
    ]);
  });

  it("captures Sentry and rethrows when prisma.link.findMany fails", async () => {
    vi.mocked(prisma.link.findMany).mockRejectedValue(new Error("db fail"));

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await expect(callToolExecute(tools.listSavedItems, {})).rejects.toThrow(
      "db fail",
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          phase: "tool_execute",
          tool: "listSavedItems",
          userId,
          chatId: TEST_CHAT_ID,
        }),
      }),
    );
  });

  it("emits a transient protocol error when streamWriter is set and listSavedItems fails", async () => {
    vi.mocked(prisma.link.findMany).mockRejectedValue(new Error("db fail"));
    const write = vi.fn();
    const streamWriter = { write, merge: vi.fn(), onError: undefined };

    const tools = buildChatTools(userId, {
      chatId: TEST_CHAT_ID,
      streamWriter: streamWriter as never,
    });
    await expect(callToolExecute(tools.listSavedItems, {})).rejects.toThrow(
      "db fail",
    );

    expect(write).toHaveBeenCalledWith({
      type: "data-chat-protocol-error",
      data: {
        code: CHAT_STREAM_ERROR_CODES.TOOL_FAILED,
        userMessage:
          "Something went wrong while loading your saved items. Please try again.",
        tool: "listSavedItems",
      },
      transient: true,
    });
  });
});

describe("buildChatTools – searchContent", () => {
  const userId = "user-456";

  beforeEach(() => {
    vi.mocked(semanticSearch).mockReset();
    vi.mocked(prisma.linkContent.findMany).mockReset();
    vi.mocked(Sentry.captureException).mockReset();
  });

  it("returns empty array when semanticSearch finds no results", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    const result = await callToolExecute(tools.searchContent, {
      query: "react hooks",
    });

    expect(result).toEqual([]);
    expect(prisma.linkContent.findMany).not.toHaveBeenCalled();
  });

  it("passes query and userId to semanticSearch with default matchCount=10", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.searchContent, { query: "typescript tips" });

    expect(semanticSearch).toHaveBeenCalledWith(
      "typescript tips",
      userId,
      expect.objectContaining({ matchCount: 10 }),
    );
  });

  it("clamps limit above 20 to 20 for matchCount", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.searchContent, { query: "q", limit: 100 });

    expect(semanticSearch).toHaveBeenCalledWith(
      "q",
      userId,
      expect.objectContaining({ matchCount: 20 }),
    );
  });

  it("clamps limit below 1 to 1 for matchCount", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    await callToolExecute(tools.searchContent, { query: "q", limit: 0 });

    expect(semanticSearch).toHaveBeenCalledWith(
      "q",
      userId,
      expect.objectContaining({ matchCount: 1 }),
    );
  });

  it("groups linkContent chunks by link title and returns relevantContent", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([
      { linkId: "l1", similarity: 0.9, vectorSimilarity: 0.9 },
    ]);
    const createdAt = new Date("2025-05-01T00:00:00Z");
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      {
        content: "Part one",
        link: {
          title: "Great Article",
          url: "https://great.com",
          contentType: "WEB",
          createdAt,
        },
      },
      {
        content: "Part two",
        link: {
          title: "Great Article",
          url: "https://great.com",
          contentType: "WEB",
          createdAt,
        },
      },
    ] as never);

    const tools = buildChatTools(userId, { chatId: TEST_CHAT_ID });
    const result = await callToolExecute(tools.searchContent, { query: "great" });

    expect(result).toEqual([
      {
        title: "Great Article",
        url: "https://great.com",
        contentType: "WEB",
        savedAt: createdAt.toISOString(),
        relevantContent: "Part one\n\nPart two",
      },
    ]);
  });
});
