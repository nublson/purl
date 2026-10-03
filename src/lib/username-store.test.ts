import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockRedirectDeleteMany = vi.fn();
const mockRedirectUpsert = vi.fn();
const client = {
  user: {
    findUnique: mockFindUnique,
    update: mockUpdate,
  },
  usernameRedirect: {
    deleteMany: mockRedirectDeleteMany,
    upsert: mockRedirectUpsert,
  },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...client,
    $transaction: (cb: (tx: typeof client) => unknown) => cb(client),
  },
}));

const { isUsernameTaken, setUsername } = await import("./username-store");

describe("isUsernameTaken", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  it("returns false when no user owns the username", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(isUsernameTaken("free-name")).resolves.toBe(false);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { username: "free-name" },
      select: { id: true },
    });
  });

  it("returns true when another user owns the username", async () => {
    mockFindUnique.mockResolvedValue({ id: "user-2" });
    await expect(isUsernameTaken("taken", "user-1")).resolves.toBe(true);
  });

  it("returns false when the username belongs to exceptUserId", async () => {
    mockFindUnique.mockResolvedValue({ id: "user-1" });
    await expect(isUsernameTaken("my-name", "user-1")).resolves.toBe(false);
  });
});

describe("setUsername", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockFindUnique.mockReset().mockResolvedValue({ username: "old-name" });
    mockRedirectDeleteMany.mockReset();
    mockRedirectUpsert.mockReset();
  });

  it("returns ok when the update succeeds, keeping the old name as a redirect", async () => {
    mockUpdate.mockResolvedValue({ id: "user-1", username: "new-name" });
    await expect(setUsername("user-1", "new-name")).resolves.toBe("ok");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { username: "new-name" },
    });
    expect(mockRedirectDeleteMany).toHaveBeenCalledWith({ where: { username: "new-name" } });
    expect(mockRedirectUpsert).toHaveBeenCalledWith({
      where: { username: "old-name" },
      create: { username: "old-name", userId: "user-1" },
      update: { userId: "user-1" },
    });
  });

  it("returns taken on a P2002 unique-constraint race without throwing", async () => {
    mockUpdate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    await expect(setUsername("user-1", "race-name")).resolves.toBe("taken");
  });

  it("rethrows non-P2002 errors", async () => {
    const err = new Error("db down");
    mockUpdate.mockRejectedValue(err);
    await expect(setUsername("user-1", "x")).rejects.toThrow("db down");
  });
});
