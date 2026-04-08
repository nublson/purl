import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/links", () => {
  class UnauthorizedError extends Error {
    readonly name = "UnauthorizedError";
  }
  return {
    refreshLink: vi.fn(),
    UnauthorizedError,
  };
});

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

const { refreshLink, UnauthorizedError } = await import("@/lib/links");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const { POST } = await import("./route");

describe("POST /api/links/[id]/reingest", () => {
  const CREATED_AT = new Date("2025-06-15T10:00:00Z");

  beforeEach(() => {
    vi.mocked(refreshLink).mockReset();
    vi.mocked(broadcastLinksChanged).mockClear();
  });

  it("returns 404 when refreshLink returns null", async () => {
    vi.mocked(refreshLink).mockResolvedValue(null);

    const res = await POST(new NextRequest("http://localhost/api/links/x/reingest"), {
      params: Promise.resolve({ id: "x" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("returns 200, serialized link, and broadcasts when refresh succeeds", async () => {
    vi.mocked(refreshLink).mockResolvedValue({
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
    expect(refreshLink).toHaveBeenCalledWith("link-1");
    expect(broadcastLinksChanged).toHaveBeenCalledWith("user-123");
  });

  it("returns 401 when UnauthorizedError is thrown", async () => {
    vi.mocked(refreshLink).mockRejectedValue(new UnauthorizedError());

    const res = await POST(
      new NextRequest("http://localhost/api/links/link-1/reingest"),
      { params: Promise.resolve({ id: "link-1" }) },
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
