import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockListConnectedApps = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  listConnectedApps: mockListConnectedApps,
}));

const { GET } = await import("./route");

// getBrowserSessionUserId's own rejection of Authorization-header (API-key)
// requests is covered in src/lib/require-browser-session.test.ts -- this
// route just trusts whatever it returns.
describe("GET /api/user/connected-apps", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockListConnectedApps.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/user/connected-apps"));
    expect(res.status).toBe(401);
    expect(mockListConnectedApps).not.toHaveBeenCalled();
  });

  it("returns the user's connected apps for a real browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockListConnectedApps.mockResolvedValue([
      { clientId: "client-1", name: "Claude Desktop", createdAt: "2026-07-01T00:00:00.000Z" },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/user/connected-apps"));
    expect(mockListConnectedApps).toHaveBeenCalledWith("user-1");
    expect(await res.json()).toEqual([
      { clientId: "client-1", name: "Claude Desktop", createdAt: "2026-07-01T00:00:00.000Z" },
    ]);
  });
});
