import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
const mockDeleteApiKey = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      deleteApiKey: mockDeleteApiKey,
    },
  },
}));

const params = Promise.resolve({ id: "k1" });

describe("DELETE /api/v1/keys/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
  });

  it("revokes the key and returns 204", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockDeleteApiKey.mockResolvedValue({ success: true });
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(204);
  });

  it("returns 404 when key not found or not owned", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockDeleteApiKey.mockResolvedValue({ success: false });
    const { DELETE } = await import("./route");
    const req = new NextRequest("http://localhost/api/v1/keys/k1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when authenticated user tries to delete another user's key", async () => {
    // Ownership is enforced by the Better Auth apiKey plugin — it returns
    // { success: false } when the session user doesn't own the key.
    mockGetSession.mockResolvedValue({ user: { id: "u2" } });
    mockDeleteApiKey.mockResolvedValue({ success: false });
    const { DELETE } = await import("./route");
    const otherUsersKeyParams = Promise.resolve({ id: "k-owned-by-u1" });
    const req = new NextRequest("http://localhost/api/v1/keys/k-owned-by-u1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: otherUsersKeyParams });
    expect(res.status).toBe(404);
  });
});
