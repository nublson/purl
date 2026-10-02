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

const mockLimit = vi.fn();
const mockGetUsernameChangeRateLimiter = vi.fn();
vi.mock("@/lib/upstash-rate-limit", () => ({
  getUsernameChangeRateLimiter: mockGetUsernameChangeRateLimiter,
}));

const { PATCH } = await import("./route");

/** `findUnique` mock for a user named "old-name" whose new name is free. */
function freeName(where: { id?: string; username?: string }) {
  if (where.id) return Promise.resolve({ username: "old-name" });
  return Promise.resolve(null);
}

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
    mockLimit.mockReset();
    // No Upstash in tests by default (as in local dev): no limiter.
    mockGetUsernameChangeRateLimiter.mockReset().mockReturnValue(null);
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

  describe("rate limiting", () => {
    beforeEach(() => {
      mockGetUsernameChangeRateLimiter.mockReturnValue({ limit: mockLimit });
    });

    it("returns 429 RATE_LIMITED with Retry-After once the user's change limit is spent, without writing", async () => {
      mockGetBrowserSessionUserId.mockResolvedValue("user-1");
      mockFindUnique.mockImplementation(({ where }) => freeName(where));
      mockLimit.mockResolvedValue({ success: false, reset: Date.now() + 120_000 });

      const res = await PATCH(patchRequest({ username: "fresh-name" }));

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({
        error: "Too many username changes. Try again in a while.",
        code: "RATE_LIMITED",
      });
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(100);
      expect(mockLimit).toHaveBeenCalledWith("user-1");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("counts a real change against the user's (not the IP's) quota", async () => {
      mockGetBrowserSessionUserId.mockResolvedValue("user-1");
      mockFindUnique.mockImplementation(({ where }) => freeName(where));
      mockLimit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
      mockUpdate.mockResolvedValue({ id: "user-1", username: "fresh-name" });

      const res = await PATCH(patchRequest({ username: "fresh-name" }));

      expect(res.status).toBe(200);
      expect(mockLimit).toHaveBeenCalledWith("user-1");
    });

    it("doesn't charge signed-out requests, rejected names, taken names or no-op saves", async () => {
      mockGetBrowserSessionUserId.mockResolvedValue(null);
      expect((await PATCH(patchRequest({ username: "fresh-name" }))).status).toBe(401);

      mockGetBrowserSessionUserId.mockResolvedValue("user-1");
      expect((await PATCH(patchRequest({ username: "NO SPACES" }))).status).toBe(400);

      mockFindUnique.mockImplementation(({ where }) =>
        where.id
          ? Promise.resolve({ username: "old-name" })
          : Promise.resolve({ id: "user-2" }),
      );
      expect((await PATCH(patchRequest({ username: "taken-name" }))).status).toBe(409);

      mockFindUnique.mockImplementation(({ where }) =>
        where.id ? Promise.resolve({ username: "same-name" }) : Promise.resolve(null),
      );
      expect((await PATCH(patchRequest({ username: "same-name" }))).status).toBe(200);

      expect(mockLimit).not.toHaveBeenCalled();
    });
  });
});
