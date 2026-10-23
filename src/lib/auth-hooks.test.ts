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

describe("revokeSaveOnlyAppsOnSignOut", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRevoke.mockReset();
  });

  it("revokes only the save-only clients' connections for the signing-out user", async () => {
    const { revokeSaveOnlyAppsOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRevoke.mockResolvedValue(undefined);
    await revokeSaveOnlyAppsOnSignOut({} as never);
    expect(mockRevoke.mock.calls).toEqual([
      ["user-1", "nublson-com"],
      ["user-1", "purl-extension-chrome"],
      ["user-1", "purl-extension-safari"],
    ]);
  });

  it("still revokes the extension when the portfolio fails", async () => {
    const { revokeSaveOnlyAppsOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRevoke.mockImplementation(async (_userId: string, clientId: string) => {
      if (clientId === "nublson-com") throw new Error("db down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await revokeSaveOnlyAppsOnSignOut({} as never);
    expect(mockRevoke).toHaveBeenCalledWith("user-1", "purl-extension-chrome");
    expect(mockRevoke).toHaveBeenCalledWith("user-1", "purl-extension-safari");
    spy.mockRestore();
  });

  it("does nothing without a session", async () => {
    const { revokeSaveOnlyAppsOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue(null);
    await revokeSaveOnlyAppsOnSignOut({} as never);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("never blocks sign-out when revoking fails", async () => {
    const { revokeSaveOnlyAppsOnSignOut } = await import("./auth-hooks");
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRevoke.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(revokeSaveOnlyAppsOnSignOut({} as never)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
