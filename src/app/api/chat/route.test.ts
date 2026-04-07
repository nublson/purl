import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

vi.mock("@/lib/chat", () => ({
  buildMentionContext: vi.fn(),
  streamChatResponse: vi.fn(),
}));

vi.mock("@/lib/chats", () => ({
  saveMessage: vi.fn(),
  verifyChatOwnership: vi.fn(),
}));

vi.mock("ai", () => ({
  convertToModelMessages: vi.fn().mockReturnValue([]),
}));

const { auth } = await import("@/lib/auth");
const { buildMentionContext, streamChatResponse } = await import("@/lib/chat");
const { saveMessage, verifyChatOwnership } = await import("@/lib/chats");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

const VALID_MESSAGES = [
  {
    id: "msg-1",
    role: "user",
    content: "What did I read this week?",
    parts: [{ type: "text", text: "What did I read this week?" }],
  },
];

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function mockStreamResult() {
  const streamResult = {
    toUIMessageStreamResponse: vi.fn().mockReturnValue(
      new Response("stream", { status: 200 }),
    ),
  };
  vi.mocked(streamChatResponse).mockReturnValue(streamResult as never);
  return streamResult;
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(buildMentionContext).mockReset();
    vi.mocked(streamChatResponse).mockReset();
    vi.mocked(saveMessage).mockReset();
    vi.mocked(verifyChatOwnership).mockReset();
    vi.mocked(saveMessage).mockResolvedValue({} as never);
    vi.mocked(buildMentionContext).mockResolvedValue(null);
  });

  describe("authentication", () => {
    it("returns 401 when there is no session", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const res = await POST(postRequest({ chatId: "c1", messages: VALID_MESSAGES }));

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when session has no user id", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({ user: {}, session: {} } as never);

      const res = await POST(postRequest({ chatId: "c1", messages: VALID_MESSAGES }));

      expect(res.status).toBe(401);
    });
  });

  describe("request body validation", () => {
    it("returns 400 when body is not valid JSON", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        body: "{{invalid json}}",
        headers: { "content-type": "application/json" },
      });

      const res = await POST(req);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid request body" });
    });

    it("returns 400 when chatId is missing", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

      const res = await POST(postRequest({ messages: VALID_MESSAGES }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "chatId is required" });
    });

    it("returns 400 when chatId is not a string", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

      const res = await POST(postRequest({ chatId: 123, messages: VALID_MESSAGES }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "chatId is required" });
    });

    it("returns 400 when messages array is missing", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

      const res = await POST(postRequest({ chatId: "chat-1" }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Messages array is required" });
    });

    it("returns 400 when messages array is empty", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

      const res = await POST(postRequest({ chatId: "chat-1", messages: [] }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Messages array is required" });
    });
  });

  describe("ownership check", () => {
    it("returns 404 when the user does not own the chat", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(verifyChatOwnership).mockResolvedValue(false);

      const res = await POST(
        postRequest({ chatId: "chat-other", messages: VALID_MESSAGES }),
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Chat not found" });
    });
  });

  describe("happy path", () => {
    it("saves the user message and streams without mention context when no mentionedLinkIds", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(verifyChatOwnership).mockResolvedValue(true);
      mockStreamResult();

      const res = await POST(
        postRequest({ chatId: "chat-1", messages: VALID_MESSAGES }),
      );

      expect(verifyChatOwnership).toHaveBeenCalledWith("chat-1", "user-123");
      expect(saveMessage).toHaveBeenCalledWith(
        "chat-1",
        "USER",
        "What did I read this week?",
        undefined,
      );
      expect(buildMentionContext).not.toHaveBeenCalled();
      expect(streamChatResponse).toHaveBeenCalledWith(
        [],
        "user-123",
        null,
        expect.any(Function),
      );
      expect(res.status).toBe(200);
    });

    it("builds mention context and passes it to streamChatResponse when mentionedLinkIds provided", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(verifyChatOwnership).mockResolvedValue(true);
      vi.mocked(buildMentionContext).mockResolvedValue("### My Article\n...");
      mockStreamResult();

      await POST(
        postRequest({
          chatId: "chat-1",
          messages: VALID_MESSAGES,
          mentionedLinkIds: ["link-1", "link-2"],
        }),
      );

      expect(buildMentionContext).toHaveBeenCalledWith(["link-1", "link-2"]);
      expect(streamChatResponse).toHaveBeenCalledWith(
        [],
        "user-123",
        "### My Article\n...",
        expect.any(Function),
      );
    });

    it("does not call buildMentionContext when mentionedLinkIds is an empty array", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
      vi.mocked(verifyChatOwnership).mockResolvedValue(true);
      mockStreamResult();

      await POST(
        postRequest({
          chatId: "chat-1",
          messages: VALID_MESSAGES,
          mentionedLinkIds: [],
        }),
      );

      expect(buildMentionContext).not.toHaveBeenCalled();
      expect(streamChatResponse).toHaveBeenCalledWith(
        [],
        "user-123",
        null,
        expect.any(Function),
      );
    });
  });
});
