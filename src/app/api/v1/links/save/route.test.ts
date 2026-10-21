import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

const mockReadOAuthSession = vi.fn();
vi.mock("@/lib/mcp", () => ({
  readOAuthSession: mockReadOAuthSession,
}));

const mockCreateLinkForUser = vi.fn();
vi.mock("@/lib/links", () => ({
  createLinkForUser: mockCreateLinkForUser,
}));

class MockSaveLimitError extends Error {
  readonly feature = "SAVE_LIMIT";
}
vi.mock("@/lib/entitlements", () => ({
  SaveLimitError: MockSaveLimitError,
}));

const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com/post",
  title: "Example",
  description: null,
  favicon: "https://example.com/favicon.ico",
  thumbnail: null,
  domain: "example.com",
  contentType: "WEB",
  createdAt: new Date("2025-01-01T12:00:00.000Z"),
  userId: "user-1",
  moved: false,
};

const SESSION = {
  token: "t",
  clientId: "c",
  scopes: ["links:save"],
  extra: { userId: "user-1" },
};

function post(body: string | undefined, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/v1/links/save", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("POST /api/v1/links/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOAuthSession.mockResolvedValue(SESSION);
  });

  it("returns 201 with the link and broadcasts", async () => {
    mockCreateLinkForUser.mockResolvedValue(MOCK_LINK);
    const { POST } = await import("./route");
    const res = await POST(
      post(JSON.stringify({ url: "https://example.com/post" }))
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("link-1");
    expect(body.moved).toBe(false);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mockCreateLinkForUser).toHaveBeenCalledWith(
      "user-1",
      "https://example.com/post"
    );
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 without a bearer token", async () => {
    mockReadOAuthSession.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(post(JSON.stringify({ url: "https://example.com" })));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCreateLinkForUser).not.toHaveBeenCalled();
  });

  it("returns 401 for a cookie-only request", async () => {
    mockReadOAuthSession.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      post(JSON.stringify({ url: "https://example.com" }), {
        cookie: "better-auth.session_token=abc",
      })
    );
    expect(res.status).toBe(401);
    expect(mockCreateLinkForUser).not.toHaveBeenCalled();
  });

  it("returns 403 insufficient_scope without links:save", async () => {
    mockReadOAuthSession.mockResolvedValue({ ...SESSION, scopes: ["openid"] });
    const { POST } = await import("./route");
    const res = await POST(post(JSON.stringify({ url: "https://example.com" })));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("insufficient_scope");
    expect(mockCreateLinkForUser).not.toHaveBeenCalled();
  });

  it("returns 403 LIMIT_REACHED when the save cap is reached", async () => {
    mockCreateLinkForUser.mockRejectedValue(new MockSaveLimitError("Limit reached"));
    const { POST } = await import("./route");
    const res = await POST(post(JSON.stringify({ url: "https://example.com" })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Limit reached",
      code: "LIMIT_REACHED",
      feature: "SAVE_LIMIT",
    });
  });

  it.each([
    ["invalid URL", JSON.stringify({ url: "not-a-url" })],
    ["missing URL", JSON.stringify({})],
    ["non-string URL", JSON.stringify({ url: 5 })],
    ["empty body", ""],
    ["non-JSON body", "not-json"],
    ["null body", "null"],
    ["array body", "[]"],
    ["string body", '"x"'],
  ])("returns 400 for %s", async (_name, raw) => {
    const { POST } = await import("./route");
    const res = await POST(post(raw));
    expect(res.status).toBe(400);
    expect(mockCreateLinkForUser).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/v1/links/save", () => {
  it("returns 204 allowing the Authorization header", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization"
    );
  });
});
