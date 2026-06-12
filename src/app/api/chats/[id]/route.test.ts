import { buildChatErrorBody, CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "./route";

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
  updateChatTitle: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { getChatWithMessages, deleteChat, updateChatTitle } = await import(
  "@/lib/chats"
);

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chats/chat-1", {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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

describe("PATCH /api/chats/[id]", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(updateChatTitle).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", { title: "Renamed" }),
      params("chat-1"),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(
      buildChatErrorBody(
        CHAT_ERROR_CODES.SESSION_EXPIRED,
        "Please sign in again.",
      ),
    );
    expect(updateChatTitle).not.toHaveBeenCalled();
  });

  it("returns 400 when title is missing or blank", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const missingTitle = await PATCH(makeRequest("PATCH", {}), params("chat-1"));
    const blankTitle = await PATCH(
      makeRequest("PATCH", { title: "   " }),
      params("chat-1"),
    );

    expect(missingTitle.status).toBe(400);
    expect(await missingTitle.json()).toEqual(
      buildChatErrorBody(
        CHAT_ERROR_CODES.INTERNAL_ERROR,
        "Title is required.",
      ),
    );
    expect(blankTitle.status).toBe(400);
    expect(updateChatTitle).not.toHaveBeenCalled();
  });

  it("returns 404 when the chat is not found or does not belong to the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(updateChatTitle).mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", { title: "Renamed" }),
      params("chat-ghost"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(
      buildChatErrorBody(CHAT_ERROR_CODES.CHAT_NOT_FOUND, "Chat not found."),
    );
  });

  it("returns the updated chat when rename succeeds", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const updated = { id: "chat-1", title: "Renamed" };
    vi.mocked(updateChatTitle).mockResolvedValue(updated);

    const res = await PATCH(
      makeRequest("PATCH", { title: "Renamed" }),
      params("chat-1"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(updateChatTitle).toHaveBeenCalledWith("chat-1", "Renamed");
  });
});
