import { buildChatErrorBody, CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

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
  getChatsForCurrentUser: vi.fn(),
  createChat: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { getChatsForCurrentUser, createChat } = await import("@/lib/chats");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chats", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/chats", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(getChatsForCurrentUser).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(
      buildChatErrorBody(
        CHAT_ERROR_CODES.SESSION_EXPIRED,
        "Please sign in again.",
      ),
    );
    expect(getChatsForCurrentUser).not.toHaveBeenCalled();
  });

  it("returns the list of chats for the authenticated user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const chats = [
      { id: "c1", title: "Chat 1", updatedAt: new Date().toISOString() },
    ];
    vi.mocked(getChatsForCurrentUser).mockResolvedValue(chats as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chats });
    expect(getChatsForCurrentUser).toHaveBeenCalledOnce();
  });
});

describe("POST /api/chats", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(createChat).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await POST(postRequest({ title: "My Chat" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(
      buildChatErrorBody(
        CHAT_ERROR_CODES.SESSION_EXPIRED,
        "Please sign in again.",
      ),
    );
    expect(createChat).not.toHaveBeenCalled();
  });

  it("creates a chat with the provided title and returns 201", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const chat = { id: "c-new", title: "My Chat", userId: "user-123" };
    vi.mocked(createChat).mockResolvedValue(chat as never);

    const res = await POST(postRequest({ title: "My Chat" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(chat);
    expect(createChat).toHaveBeenCalledWith("My Chat");
  });

  it("creates a chat with undefined title when body has no title field", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const chat = { id: "c-new", title: null, userId: "user-123" };
    vi.mocked(createChat).mockResolvedValue(chat as never);

    const res = await POST(postRequest({}));

    expect(res.status).toBe(201);
    expect(createChat).toHaveBeenCalledWith(undefined);
  });

  it("creates a chat with undefined title when body is malformed JSON", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const chat = { id: "c-new", title: null, userId: "user-123" };
    vi.mocked(createChat).mockResolvedValue(chat as never);

    const req = new NextRequest("http://localhost/api/chats", {
      method: "POST",
      body: "{{bad json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(createChat).toHaveBeenCalledWith(undefined);
  });

  it("trims whitespace from the title before creating the chat", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createChat).mockResolvedValue({ id: "c-new" } as never);

    await POST(postRequest({ title: "  My Chat  " }));

    expect(createChat).toHaveBeenCalledWith("My Chat");
  });
});
