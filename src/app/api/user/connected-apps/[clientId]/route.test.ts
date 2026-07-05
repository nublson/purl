import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockRevokeConnectedApp = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  revokeConnectedApp: mockRevokeConnectedApp,
}));

const { DELETE } = await import("./route");

function makeContext(clientId: string) {
  return { params: Promise.resolve({ clientId }) };
}

// getBrowserSessionUserId's own rejection of Authorization-header (API-key)
// requests is covered in src/lib/require-browser-session.test.ts -- proves
// this security kill-switch route can't be triggered by just a leaked API
// key. This route just trusts whatever the guard returns.
describe("DELETE /api/user/connected-apps/[clientId]", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockRevokeConnectedApp.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(res.status).toBe(401);
    expect(mockRevokeConnectedApp).not.toHaveBeenCalled();
  });

  it("returns 404 when there was nothing to revoke", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockRevokeConnectedApp.mockResolvedValue(false);

    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 and revokes the app scoped to the session user", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockRevokeConnectedApp.mockResolvedValue(true);

    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(mockRevokeConnectedApp).toHaveBeenCalledWith("user-1", "client-1");
    expect(res.status).toBe(204);
  });
});
