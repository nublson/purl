import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
}));

const mockFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

const { GET } = await import("./route");

function availableRequest(u: string) {
  return new NextRequest(
    `http://localhost/api/user/username/available?u=${encodeURIComponent(u)}`,
  );
}

describe("GET /api/user/username/available", () => {
  beforeEach(() => {
    mockGetBrowserSessionUserId.mockReset();
    mockFindUnique.mockReset();
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);
    const res = await GET(availableRequest("nublson"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns available: false, reason: format for a badly formatted username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await GET(availableRequest("a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "format" });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns available: false, reason: reserved for a reserved username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    const res = await GET(availableRequest("admin"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "reserved" });
  });

  it("returns available: false, reason: taken when someone else owns it", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "my-current-name" });
      if (where.username) return Promise.resolve({ id: "user-2" });
      return Promise.resolve(null);
    });

    const res = await GET(availableRequest("taken-name"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "taken" });
  });

  it("returns available: true for your own current username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "my-current-name" });
      return Promise.resolve(null);
    });

    const res = await GET(availableRequest("My-Current-Name"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
    expect(mockFindUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: "my-current-name" } }),
    );
  });

  it("returns available: true for a free, unowned username", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id) return Promise.resolve({ username: "my-current-name" });
      if (where.username) return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const res = await GET(availableRequest("free-name"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });
});
