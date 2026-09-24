import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({
  default: { link: { findMany: vi.fn() } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const { GET } = await import("./route");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function searchRequest(q?: string): NextRequest {
  const qs = q === undefined ? "" : `?${new URLSearchParams({ q })}`;
  return new NextRequest(`http://localhost/api/links/search${qs}`);
}

describe("GET /api/links/search", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.findMany).mockReset();
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET(searchRequest("next"));

    expect(res.status).toBe(401);
  });

  it("searches title, url, domain, and description case-insensitively, capped at 20", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const res = await GET(searchRequest("  Next  "));

    expect(res.status).toBe(200);
    const contains = { contains: "Next", mode: "insensitive" };
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith({
      where: {
        userId: "user-123",
        OR: [
          { title: contains },
          { url: contains },
          { domain: contains },
          { description: contains },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });

  it("returns the most recent links for an empty query", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    await GET(searchRequest());

    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-123" }, take: 20 }),
    );
  });
});
