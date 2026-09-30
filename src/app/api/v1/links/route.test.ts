import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

const mockListLinks = vi.fn();
const mockCreateLink = vi.fn();

class MockUnauthorizedError extends Error {
  constructor() { super("Unauthorized"); }
}
class MockSaveLimitError extends Error {
  readonly feature = "SAVE_LIMIT";
}

vi.mock("@/lib/links", () => ({
  listLinks: mockListLinks,
  createLink: mockCreateLink,
  UnauthorizedError: MockUnauthorizedError,
}));
vi.mock("@/lib/entitlements", () => ({
  SaveLimitError: MockSaveLimitError,
}));

class MockFolderNotFoundError extends Error {
  constructor() { super("Folder not found."); }
}
vi.mock("@/lib/folders", () => ({
  FolderNotFoundError: MockFolderNotFoundError,
}));

const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com",
  title: "Example",
  description: null,
  favicon: "https://example.com/favicon.ico",
  thumbnail: null,
  domain: "example.com",
  contentType: "WEB",
  createdAt: new Date("2025-01-01T12:00:00.000Z"),
  userId: "user-1",
};

describe("GET /api/v1/links", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockListLinks.mockRejectedValue(new MockUnauthorizedError());
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/v1/links"));
    expect(res.status).toBe(401);
  });

  it("returns paginated links with CORS header", async () => {
    mockListLinks.mockResolvedValue({ links: [MOCK_LINK], nextCursor: null });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/v1/links"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("passes limit, cursor, contentType from query params", async () => {
    mockListLinks.mockResolvedValue({ links: [], nextCursor: null });
    const { GET } = await import("./route");
    await GET(
      new NextRequest(
        "http://localhost/api/v1/links?limit=10&cursor=2025-01-01T00%3A00%3A00.000Z&contentType=YOUTUBE"
      )
    );
    expect(mockListLinks).toHaveBeenCalledWith({
      limit: 10,
      cursor: "2025-01-01T00:00:00.000Z",
      contentType: "YOUTUBE",
    });
  });

  it("clamps limit to 100", async () => {
    mockListLinks.mockResolvedValue({ links: [], nextCursor: null });
    const { GET } = await import("./route");
    await GET(new NextRequest("http://localhost/api/v1/links?limit=999"));
    expect(mockListLinks).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  it("ignores unknown contentType values", async () => {
    mockListLinks.mockResolvedValue({ links: [], nextCursor: null });
    const { GET } = await import("./route");
    await GET(new NextRequest("http://localhost/api/v1/links?contentType=INVALID"));
    expect(mockListLinks).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: null })
    );
  });

  it("passes folderId from query params", async () => {
    mockListLinks.mockResolvedValue({ links: [], nextCursor: null });
    const { GET } = await import("./route");
    await GET(new NextRequest("http://localhost/api/v1/links?folderId=folder-1"));
    expect(mockListLinks).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "folder-1" })
    );
  });

  it("omits folderId when not provided", async () => {
    mockListLinks.mockResolvedValue({ links: [], nextCursor: null });
    const { GET } = await import("./route");
    await GET(new NextRequest("http://localhost/api/v1/links"));
    expect(mockListLinks).toHaveBeenCalledWith(
      expect.not.objectContaining({ folderId: expect.anything() })
    );
  });

  it("returns 404 for an unknown folderId", async () => {
    mockListLinks.mockRejectedValue(new MockFolderNotFoundError());
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links?folderId=missing")
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Folder not found" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("POST /api/v1/links", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateLink.mockRejectedValue(new MockUnauthorizedError());
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing URL", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid URL", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ url: "not-a-url" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 with link and CORS header on success", async () => {
    mockCreateLink.mockResolvedValue(MOCK_LINK);
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("link-1");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 403 LIMIT_REACHED when the save cap is reached", async () => {
    mockCreateLink.mockRejectedValue(
      new MockSaveLimitError("Limit reached")
    );
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: "Limit reached",
      code: "LIMIT_REACHED",
      feature: "SAVE_LIMIT",
    });
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: "not-json",
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("passes folderId through to createLink", async () => {
    mockCreateLink.mockResolvedValue(MOCK_LINK);
    const { POST } = await import("./route");
    await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com", folderId: "folder-1" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(mockCreateLink).toHaveBeenCalledWith("https://example.com", {
      folderId: "folder-1",
    });
  });

  it("returns 404 for an unknown folderId", async () => {
    mockCreateLink.mockRejectedValue(new MockFolderNotFoundError());
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com", folderId: "missing" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Folder not found" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("OPTIONS /api/v1/links", () => {
  it("returns 204 with CORS headers", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/v1/links", { method: "OPTIONS" })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
