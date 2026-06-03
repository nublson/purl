import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
    },
  },
}));

const mockReadLink = vi.fn();
const mockUpdateLink = vi.fn();
const mockDeleteLink = vi.fn();

class MockUnauthorizedError extends Error {
  constructor() { super("Unauthorized"); }
}

vi.mock("@/lib/links", () => ({
  readLink: mockReadLink,
  updateLink: mockUpdateLink,
  deleteLink: mockDeleteLink,
  UnauthorizedError: MockUnauthorizedError,
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
  ingestStatus: "COMPLETED",
  createdAt: new Date("2025-01-01T12:00:00.000Z"),
  userId: "user-1",
};

const params = Promise.resolve({ id: "link-1" });

describe("GET /api/v1/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockReadLink.mockRejectedValue(new MockUnauthorizedError());
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links/link-1"),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockReadLink.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links/link-1"),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns link with CORS header", async () => {
    mockReadLink.mockResolvedValue(MOCK_LINK);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/v1/links/link-1"),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("link-1");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("PATCH /api/v1/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockUpdateLink.mockRejectedValue(new MockUnauthorizedError());
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockUpdateLink.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns updated link with CORS header", async () => {
    mockUpdateLink.mockResolvedValue({ ...MOCK_LINK, title: "New Title" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("New Title");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 400 when no updatable fields provided", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: "not-json",
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid URL", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/links/link-1", {
        method: "PATCH",
        body: JSON.stringify({ url: "not-a-url" }),
        headers: { "content-type": "application/json" },
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockDeleteLink.mockRejectedValue(new MockUnauthorizedError());
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockDeleteLink.mockResolvedValue(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 with CORS header on success", async () => {
    mockDeleteLink.mockResolvedValue(true);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("OPTIONS /api/v1/links/:id", () => {
  it("returns 204 with CORS headers", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/v1/links/link-1", { method: "OPTIONS" })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
