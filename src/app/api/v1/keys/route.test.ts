import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
const mockCreateApiKey = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      createApiKey: mockCreateApiKey,
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    apikey: {
      findMany: mockFindMany,
    },
  },
}));

describe("POST /api/v1/keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys", {
      method: "POST",
      body: JSON.stringify({ name: "my key" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates and returns a key when authenticated", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockCreateApiKey.mockResolvedValue({
      id: "k1",
      key: "purl_abc123",
      name: "my key",
      createdAt: new Date().toISOString(),
    });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys", {
      method: "POST",
      body: JSON.stringify({ name: "my key" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBe("purl_abc123");
  });

  it("returns 400 when body is not valid JSON", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns list of keys", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindMany.mockResolvedValue([
      { id: "k1", name: "my key", start: "purl_ab", createdAt: new Date() },
    ]);
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("k1");
  });
});
