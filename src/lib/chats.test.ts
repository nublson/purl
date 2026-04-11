import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    chat: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    link: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getChatModel: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { generateText } = await import("ai");
const { getChatModel } = await import("@/lib/ai");
const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const {
  verifyChatOwnership,
  filterMentionLinkIdsForUser,
  saveMessage,
  createChat,
  deleteChat,
  getChatsForCurrentUser,
  getChatWithMessages,
} = await import("./chats");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function mockSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
}

function mockNoSession() {
  vi.mocked(auth.api.getSession).mockResolvedValue(null);
}

describe("verifyChatOwnership", () => {
  beforeEach(() => {
    vi.mocked(prisma.chat.findFirst).mockReset();
  });

  it("returns true when the chat exists for the given user", async () => {
    vi.mocked(prisma.chat.findFirst).mockResolvedValue({ id: "chat-1" } as never);

    const result = await verifyChatOwnership("chat-1", "user-123");

    expect(result).toBe(true);
    expect(prisma.chat.findFirst).toHaveBeenCalledWith({
      where: { id: "chat-1", userId: "user-123" },
      select: { id: true },
    });
  });

  it("returns false when no chat matches the given chatId and userId", async () => {
    vi.mocked(prisma.chat.findFirst).mockResolvedValue(null);

    const result = await verifyChatOwnership("chat-1", "other-user");

    expect(result).toBe(false);
  });
});

describe("filterMentionLinkIdsForUser", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.findMany).mockReset();
  });

  it("returns [] without querying when linkIds is empty", async () => {
    const result = await filterMentionLinkIdsForUser("user-1", []);
    expect(result).toEqual([]);
    expect(prisma.link.findMany).not.toHaveBeenCalled();
  });

  it("returns owned ids in input order", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      { id: "b" },
      { id: "a" },
    ] as never);

    const result = await filterMentionLinkIdsForUser("user-1", ["a", "b"]);

    expect(prisma.link.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["a", "b"] } },
      select: { id: true },
    });
    expect(result).toEqual(["a", "b"]);
  });

  it("omits ids not returned by the query (not owned)", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([{ id: "mine" }] as never);

    const result = await filterMentionLinkIdsForUser("user-1", [
      "stolen",
      "mine",
      "also-stolen",
    ]);

    expect(result).toEqual(["mine"]);
  });

  it("dedupes repeated owned ids using first occurrence order", async () => {
    vi.mocked(prisma.link.findMany).mockResolvedValue([{ id: "x" }] as never);

    const result = await filterMentionLinkIdsForUser("user-1", ["x", "x", "y"]);

    expect(result).toEqual(["x"]);
  });
});

describe("saveMessage", () => {
  const chatId = "chat-1";
  const mockMessage = { id: "msg-1", chatId, role: "USER", content: "Hello" };

  beforeEach(() => {
    vi.mocked(prisma.chatMessage.create).mockReset();
    vi.mocked(prisma.chatMessage.findFirst).mockReset();
    vi.mocked(prisma.chat.findUnique).mockReset();
    vi.mocked(prisma.chat.update).mockReset();
    vi.mocked(generateText).mockReset();
    vi.mocked(getChatModel).mockReset();
    vi.mocked(prisma.chatMessage.create).mockResolvedValue(mockMessage as never);
    vi.mocked(prisma.chat.update).mockResolvedValue({} as never);
  });

  it("creates a chatMessage row with the given chatId, role, and content", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: "Existing" } as never);

    await saveMessage(chatId, "USER", "Hello");

    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chatId,
          role: "USER",
          content: "Hello",
        }),
      }),
    );
  });

  it("connects mentionedLinkIds to the message when provided", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: "Existing" } as never);

    await saveMessage(chatId, "USER", "Hello", ["link-1", "link-2"]);

    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mentions: {
            connect: [{ id: "link-1" }, { id: "link-2" }],
          },
        }),
      }),
    );
  });

  it("omits mentions connect when mentionedLinkIds is empty", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: "Existing" } as never);

    await saveMessage(chatId, "USER", "Hello", []);

    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mentions: undefined }),
      }),
    );
  });

  it("updates chat updatedAt for a USER message without generating a title", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: null } as never);

    await saveMessage(chatId, "USER", "Hello");

    expect(generateText).not.toHaveBeenCalled();
    expect(prisma.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: chatId },
        data: expect.not.objectContaining({ title: expect.anything() }),
      }),
    );
  });

  it("generates a title when role is ASSISTANT and the chat has no title", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: null } as never);
    vi.mocked(prisma.chatMessage.findFirst).mockResolvedValue({
      content: "What are the best React patterns?",
    } as never);
    vi.mocked(getChatModel).mockReturnValue({ id: "model" } as never);
    vi.mocked(generateText).mockResolvedValue({ text: "Best React Patterns" } as never);

    await saveMessage(chatId, "ASSISTANT", "Here are the patterns...");

    expect(generateText).toHaveBeenCalled();
    expect(prisma.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Best React Patterns" }),
      }),
    );
  });

  it("skips title generation when role is ASSISTANT but chat already has a title", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: "Existing Title" } as never);

    await saveMessage(chatId, "ASSISTANT", "Here are the patterns...");

    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips title generation when ASSISTANT content is empty", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: null } as never);

    await saveMessage(chatId, "ASSISTANT", "   ");

    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns the created message", async () => {
    vi.mocked(prisma.chat.findUnique).mockResolvedValue({ title: "Existing" } as never);

    const result = await saveMessage(chatId, "USER", "Hello");

    expect(result).toEqual(mockMessage);
  });
});

describe("createChat", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.chat.create).mockReset();
  });

  it("creates a chat with a null title when no title is provided", async () => {
    mockSession();
    vi.mocked(prisma.chat.create).mockResolvedValue({ id: "chat-new", title: null } as never);

    await createChat();

    expect(prisma.chat.create).toHaveBeenCalledWith({
      data: { title: null, userId: "user-123" },
    });
  });

  it("creates a chat with the provided title", async () => {
    mockSession();
    vi.mocked(prisma.chat.create).mockResolvedValue({ id: "chat-new", title: "My Chat" } as never);

    await createChat("My Chat");

    expect(prisma.chat.create).toHaveBeenCalledWith({
      data: { title: "My Chat", userId: "user-123" },
    });
  });

  it("throws UnauthorizedError when there is no session", async () => {
    mockNoSession();

    await expect(createChat()).rejects.toThrow();
  });
});

describe("deleteChat", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.chat.findFirst).mockReset();
    vi.mocked(prisma.chat.delete).mockReset();
  });

  it("returns false when the chat does not belong to the user", async () => {
    mockSession();
    vi.mocked(prisma.chat.findFirst).mockResolvedValue(null);

    const result = await deleteChat("chat-ghost");

    expect(result).toBe(false);
    expect(prisma.chat.delete).not.toHaveBeenCalled();
  });

  it("deletes the chat and returns true when it belongs to the user", async () => {
    mockSession();
    vi.mocked(prisma.chat.findFirst).mockResolvedValue({ id: "chat-1" } as never);
    vi.mocked(prisma.chat.delete).mockResolvedValue({} as never);

    const result = await deleteChat("chat-1");

    expect(result).toBe(true);
    expect(prisma.chat.delete).toHaveBeenCalledWith({ where: { id: "chat-1" } });
  });
});

describe("getChatsForCurrentUser", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.chat.findMany).mockReset();
  });

  it("returns chats for the authenticated user ordered by updatedAt desc", async () => {
    mockSession();
    const chats = [{ id: "c1", title: "Chat 1", updatedAt: new Date() }];
    vi.mocked(prisma.chat.findMany).mockResolvedValue(chats as never);

    const result = await getChatsForCurrentUser();

    expect(result).toEqual(chats);
    expect(prisma.chat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123" },
        orderBy: { updatedAt: "desc" },
      }),
    );
  });

  it("throws when unauthenticated", async () => {
    mockNoSession();

    await expect(getChatsForCurrentUser()).rejects.toThrow();
  });
});

describe("getChatWithMessages", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.chat.findFirst).mockReset();
  });

  it("returns the chat with messages when found", async () => {
    mockSession();
    const chat = { id: "chat-1", title: "Test", messages: [] };
    vi.mocked(prisma.chat.findFirst).mockResolvedValue(chat as never);

    const result = await getChatWithMessages("chat-1");

    expect(result).toEqual(chat);
    expect(prisma.chat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "chat-1", userId: "user-123" },
      }),
    );
  });

  it("returns null when the chat is not found or does not belong to the user", async () => {
    mockSession();
    vi.mocked(prisma.chat.findFirst).mockResolvedValue(null);

    const result = await getChatWithMessages("missing-chat");

    expect(result).toBeNull();
  });
});
