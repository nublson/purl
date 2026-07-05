import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockRevokeConnectedApp = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  revokeConnectedApp: mockRevokeConnectedApp,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { auth } = await import("@/lib/auth");
const { DELETE } = await import("./route");

function makeContext(clientId: string) {
  return { params: Promise.resolve({ clientId }) };
}

describe("DELETE /api/user/connected-apps/[clientId]", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    mockRevokeConnectedApp.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(res.status).toBe(401);
    expect(mockRevokeConnectedApp).not.toHaveBeenCalled();
  });

  it("returns 404 when there was nothing to revoke", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    mockRevokeConnectedApp.mockResolvedValue(false);

    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 and revokes the app scoped to the session user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    mockRevokeConnectedApp.mockResolvedValue(true);

    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(mockRevokeConnectedApp).toHaveBeenCalledWith("user-1", "client-1");
    expect(res.status).toBe(204);
  });
});
