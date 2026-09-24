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
      },
      session: { token: "secret" },
    } as never);

    await expect(getSessionUser()).resolves.toEqual({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      image: null,
    });
  });
});
