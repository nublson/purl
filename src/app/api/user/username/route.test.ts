import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

const { PATCH } = await import("./route");

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/user/username", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PATCH /api/user/username", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ username: "nublson" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON body for a non-JSON body", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest("not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 INVALID_FORMAT for a badly formatted username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest({ username: "a b" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Use 3–30 lowercase letters, numbers, - or _",
      code: "INVALID_FORMAT",
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 RESERVED for a reserved username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await PATCH(patchRequest({ username: "admin" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "That username is reserved",
      code: "RESERVED",
    });
  });

  it("returns 409 TAKEN when another user already owns the username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "old-name" });
      if (where.username) return Promise.resolve({ id: "user-2" });
      return Promise.resolve(null);
    });

    const res = await PATCH(patchRequest({ username: "taken-name" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "That username is taken",
      code: "TAKEN",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 TAKEN when update rejects with a P2002 error", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "old-name" });
      if (where.username) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockUpdate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const res = await PATCH(patchRequest({ username: "race-name" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "That username is taken",
      code: "TAKEN",
    });
  });

  it("returns 200 with the normalized username on success", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "old-name" });
      if (where.username) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockUpdate.mockResolvedValue({ id: "user-1", username: "nublson" });

    const res = await PATCH(patchRequest({ username: " NubLson " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "nublson" });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { username: "nublson" },
    });
  });

  it("returns 200 without calling update when the normalized value equals the current username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "nublson" });
      return Promise.resolve(null);
    });

    const res = await PATCH(patchRequest({ username: " NubLson " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "nublson" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
