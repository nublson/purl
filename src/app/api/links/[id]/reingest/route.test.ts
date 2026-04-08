import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/links", () => {
  class UnauthorizedError extends Error {
    readonly name = "UnauthorizedError";
  }
  return {
    reingestLink: vi.fn(),
    UnauthorizedError,
  };
});

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

const { reingestLink, UnauthorizedError } = await import("@/lib/links");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const { POST } = await import("./route");

describe("POST /api/links/[id]/reingest", () => {
  const CREATED_AT = new Date("2025-06-15T10:00:00Z");

  beforeEach(() => {
    vi.mocked(reingestLink).mockReset();
    vi.mocked(broadcastLinksChanged).mockClear();
  });

  it("returns 404 when reingestLink returns null", async () => {
    vi.mocked(reingestLink).mockResolvedValue(null);

    const res = await POST(new NextRequest("http://localhost/api/links/x/reingest"), {
      params: Promise.resolve({ id: "x" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("returns 200, serialized link, and broadcasts when reingest succeeds", async () => {
    vi.mocked(reingestLink).mockResolvedValue({
      id: "link-1",
      url: "https://example.com",
      title: "Example",
      description: null,
      favicon: "https://example.com/f.ico",
      thumbnail: null,
      domain: "example.com",
      contentType: "WEB",
      ingestStatus: "PENDING",
      createdAt: CREATED_AT,
      userId: "user-123",
    } as never);

    const res = await POST(
      new NextRequest("http://localhost/api/links/link-1/reingest"),
      { params: Promise.resolve({ id: "link-1" }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "link-1",
      url: "https://example.com",
      title: "Example",
      description: null,
      favicon: "https://example.com/f.ico",
      thumbnail: null,
      domain: "example.com",
      contentType: "WEB",
      ingestStatus: "PENDING",
      createdAt: CREATED_AT.toISOString(),
    });
    expect(reingestLink).toHaveBeenCalledWith("link-1");
    expect(broadcastLinksChanged).toHaveBeenCalledWith("user-123");
  });

  it("returns 401 when UnauthorizedError is thrown", async () => {
    vi.mocked(reingestLink).mockRejectedValue(new UnauthorizedError());

    const res = await POST(
      new NextRequest("http://localhost/api/links/link-1/reingest"),
      { params: Promise.resolve({ id: "link-1" }) },
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
