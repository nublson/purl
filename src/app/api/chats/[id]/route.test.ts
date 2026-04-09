import { buildChatErrorBody, CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET } from "./route";

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

vi.mock("@/lib/chats", () => ({
  getChatWithMessages: vi.fn(),
  deleteChat: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { getChatWithMessages, deleteChat } = await import("@/lib/chats");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function makeRequest(method: string): Request {
  return new Request("http://localhost/api/chats/chat-1", { method });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/chats/[id]", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(getChatWithMessages).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), params("chat-1"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(
      buildChatErrorBody(
        CHAT_ERROR_CODES.SESSION_EXPIRED,
        "Please sign in again.",
      ),
    );
    expect(getChatWithMessages).not.toHaveBeenCalled();
  });

  it("returns 404 when the chat is not found or does not belong to the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(getChatWithMessages).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), params("chat-ghost"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(
      buildChatErrorBody(CHAT_ERROR_CODES.CHAT_NOT_FOUND, "Chat not found."),
    );
  });

  it("returns the chat with its messages when found", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const chat = {
      id: "chat-1",
      title: "My Chat",
      messages: [
        { id: "m1", role: "USER", content: "Hello", mentions: [] },
      ],
    };
    vi.mocked(getChatWithMessages).mockResolvedValue(chat as never);

    const res = await GET(makeRequest("GET"), params("chat-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(chat);
    expect(getChatWithMessages).toHaveBeenCalledWith("chat-1");
  });
});

describe("DELETE /api/chats/[id]", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(deleteChat).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), params("chat-1"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(
      buildChatErrorBody(
        CHAT_ERROR_CODES.SESSION_EXPIRED,
        "Please sign in again.",
      ),
    );
    expect(deleteChat).not.toHaveBeenCalled();
  });

  it("returns 404 when the chat is not found or does not belong to the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(deleteChat).mockResolvedValue(false);

    const res = await DELETE(makeRequest("DELETE"), params("chat-ghost"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(
      buildChatErrorBody(CHAT_ERROR_CODES.CHAT_NOT_FOUND, "Chat not found."),
    );
  });

  it("returns 204 with no body when the chat is successfully deleted", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(deleteChat).mockResolvedValue(true);

    const res = await DELETE(makeRequest("DELETE"), params("chat-1"));

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(deleteChat).toHaveBeenCalledWith("chat-1");
  });
});
