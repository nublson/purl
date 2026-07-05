import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockListConnectedApps = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  listConnectedApps: mockListConnectedApps,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { auth } = await import("@/lib/auth");
const { GET } = await import("./route");

describe("GET /api/user/connected-apps", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    mockListConnectedApps.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/user/connected-apps"));
    expect(res.status).toBe(401);
    expect(mockListConnectedApps).not.toHaveBeenCalled();
  });

  it("returns the user's connected apps", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
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
