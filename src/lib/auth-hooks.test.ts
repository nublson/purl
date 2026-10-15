import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { assignUsernameOnCreate } = await import("./auth-hooks");

describe("assignUsernameOnCreate", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it("assigns a generated username", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const result = await assignUsernameOnCreate({ email: "nubelson@x.com", name: "N" });
    expect(result.data.username).toBe("nubelson");
    expect(result.data.email).toBe("nubelson@x.com");
  });

  it("skips taken usernames", async () => {
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { username: string } }) =>
      where.username === "nubelson" ? { id: "u1" } : null) as never);
    const result = await assignUsernameOnCreate({ email: "nubelson@x.com", name: "N" });
    expect(result.data.username).toBe("nubelson2");
  });
});

const mockGetSession = vi.fn();
vi.mock("better-auth/api", () => ({
  getSessionFromCtx: (...args: unknown[]) => mockGetSession(...args),
}));
const mockRevoke = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  revokeConnectedApp: (...args: unknown[]) => mockRevoke(...args),
}));

describe("revokePortfolioOnSignOut", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRevoke.mockReset();
  });

  it("revokes only the portfolio client's connection for the signing-out user", async () => {
    const { revokePortfolioOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    await revokePortfolioOnSignOut({} as never);
    expect(mockRevoke).toHaveBeenCalledExactlyOnceWith("user-1", "nublson-com");
  });

  it("does nothing without a session", async () => {
    const { revokePortfolioOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue(null);
    await revokePortfolioOnSignOut({} as never);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("never blocks sign-out when revoking fails", async () => {
    const { revokePortfolioOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRevoke.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revokePortfolioOnSignOut({} as never)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
