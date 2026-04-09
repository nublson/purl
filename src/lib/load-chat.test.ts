import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadChatFromApi } from "./load-chat";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeApiResponse(overrides: {
  id?: string;
  title?: string | null;
  messages?: Array<{
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    mentions?: unknown[];
  }>;
} = {}) {
  return {
    id: overrides.id ?? "chat-1",
    title: overrides.title ?? null,
    messages: overrides.messages ?? [],
  };
}

// ─── loadChatFromApi ──────────────────────────────────────────────────────────

describe("loadChatFromApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok:false with status when the API responds with a non-2xx status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result).toEqual({
      ok: false,
      aborted: false,
      status: 404,
      parsed: null,
    });
  });

  it("returns ok:false with status 0 when the fetch call throws (e.g. network error)", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await loadChatFromApi("chat-1");

    expect(result).toEqual({
      ok: false,
      aborted: false,
      status: 0,
      parsed: null,
    });
  });

  it("returns ok:false aborted when the signal is already aborted before the request", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError"),
    );

    const result = await loadChatFromApi("chat-1", controller.signal);

    expect(result).toEqual({ ok: false, aborted: true });
  });

  it("calls the correct endpoint URL", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(makeApiResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await loadChatFromApi("chat-42");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/chats/chat-42",
      expect.objectContaining({}),
    );
  });

  it("returns an empty messages array when the chat has no messages", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(makeApiResponse({ id: "c1", title: "Empty chat", messages: [] })),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("c1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.messages).toEqual([]);
    expect(result.payload.messageMentions).toEqual([]);
  });

  it("maps USER messages to role='user' with text parts", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeApiResponse({
            messages: [
              { id: "m1", role: "USER", content: "Hello!", mentions: [] },
            ],
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.messages).toHaveLength(1);
    expect(result.payload.messages[0]).toMatchObject({
      id: "m1",
      role: "user",
      content: "Hello!",
      parts: [{ type: "text", text: "Hello!" }],
    });
  });

  it("maps ASSISTANT messages to role='assistant' with text parts", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeApiResponse({
            messages: [
              { id: "m2", role: "ASSISTANT", content: "Here is the answer.", mentions: [] },
            ],
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.messages[0]).toMatchObject({
      id: "m2",
      role: "assistant",
      content: "Here is the answer.",
    });
  });

  it("populates messageMentions from USER message mentions and empties for ASSISTANT", async () => {
    const mention = { id: "link-1", url: "https://example.com", title: "A" };
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeApiResponse({
            messages: [
              { id: "m1", role: "USER", content: "Check @A", mentions: [mention] },
              { id: "m2", role: "ASSISTANT", content: "Sure!", mentions: [] },
            ],
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.messageMentions).toHaveLength(2);
    expect(result.payload.messageMentions[0]).toEqual([mention]);
    expect(result.payload.messageMentions[1]).toEqual([]);
  });

  it("trims whitespace from title and coerces empty string to null", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(makeApiResponse({ title: "   " })),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.title).toBeNull();
  });

  it("preserves a non-empty title after trimming", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(makeApiResponse({ title: "  My Chat  " })),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.title).toBe("My Chat");
  });

  it("returns null title in payload when title from API is null", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(makeApiResponse({ title: null })),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("chat-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.title).toBeNull();
  });

  it("returns the correct id from the API response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(makeApiResponse({ id: "xyz-999" })),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await loadChatFromApi("xyz-999");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.id).toBe("xyz-999");
  });
});
