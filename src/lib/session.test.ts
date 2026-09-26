import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const { auth } = await import("@/lib/auth");
const { getSessionUser } = await import("./session");

describe("getSessionUser", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
  });

  it("returns null when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns only the fields client components need", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: {
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
        image: undefined,
        emailVerified: true,
        username: "ada",
      },
      session: { token: "secret" },
    } as never);

    await expect(getSessionUser()).resolves.toEqual({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      username: "ada",
    });
  });

  it("throws instead of returning a user with no username", async () => {
    // `username` is `required: false` on Better Auth's additionalFields (see
    // auth.ts) so the type allows it to be missing, but the DB column is
    // NOT NULL and databaseHooks.user.create.before always assigns one — a
    // signed-in user with no username means something upstream is broken,
    // so getSessionUser fails loudly rather than inventing a placeholder.
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: {
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
        image: undefined,
        emailVerified: true,
        username: undefined,
      },
      session: { token: "secret" },
    } as never);

    await expect(getSessionUser()).rejects.toThrow(/user-1 has no username/);
  });
});
