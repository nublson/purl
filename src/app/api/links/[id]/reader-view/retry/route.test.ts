import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reader-views", () => ({ resetFailedReaderView: vi.fn() }));
vi.mock("@/lib/upstash-rate-limit", () => ({
  getLinkPreviewRateLimiter: vi.fn(),
}));
vi.mock("@/lib/proxy-rate-limit", () => ({
  tooManyRequests: vi.fn(
    () => new NextResponse(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
  ),
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { resetFailedReaderView } = await import("@/lib/reader-views");
const { getLinkPreviewRateLimiter } = await import("@/lib/upstash-rate-limit");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const { auth } = await import("@/lib/auth");
const { POST } = await import("./route");

const call = () =>
  POST(
    new NextRequest("http://localhost/api/links/l1/reader-view/retry", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "l1" }) },
  );

describe("POST /api/links/[id]/reader-view/retry", () => {
  beforeEach(() => {
    vi.mocked(resetFailedReaderView).mockReset();
    vi.mocked(getLinkPreviewRateLimiter).mockReset().mockReturnValue(null);
    vi.mocked(broadcastLinksChanged).mockClear();
    vi.mocked(auth.api.getSession)
      .mockReset()
      .mockResolvedValue({ user: { id: "u1" } } as never);
  });

  it("401s without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await call()).status).toBe(401);
    expect(resetFailedReaderView).not.toHaveBeenCalled();
  });

  it("429s when the limiter refuses", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false, reset: Date.now() + 5000 });
    vi.mocked(getLinkPreviewRateLimiter).mockReturnValue({ limit } as never);
    expect((await call()).status).toBe(429);
    expect(limit).toHaveBeenCalledWith("u1");
    expect(resetFailedReaderView).not.toHaveBeenCalled();
  });

  it("404s when the link isn't the user's", async () => {
    vi.mocked(resetFailedReaderView).mockResolvedValue("not_found");
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("409s when the reader view isn't failed", async () => {
    vi.mocked(resetFailedReaderView).mockResolvedValue("not_failed");
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "The reader view isn't failed.",
      code: "NOT_FAILED",
    });
  });

  it("resets, answers ok and broadcasts", async () => {
    vi.mocked(resetFailedReaderView).mockResolvedValue("reset");
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(resetFailedReaderView).toHaveBeenCalledWith("u1", "l1");
    expect(broadcastLinksChanged).toHaveBeenCalledWith("u1");
  });
});
