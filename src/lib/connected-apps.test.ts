import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  default: {
    oauthConsent: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    oauthApplication: {
      findMany: vi.fn(),
    },
    oauthAccessToken: {
      deleteMany: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { listConnectedApps, revokeConnectedApp } = await import(
  "./connected-apps"
);

describe("listConnectedApps", () => {
  beforeEach(() => {
    vi.mocked(prisma.oauthConsent.findMany).mockReset();
    vi.mocked(prisma.oauthApplication.findMany).mockReset();
  });

  it("returns an empty list when the user has no consents", async () => {
    vi.mocked(prisma.oauthConsent.findMany).mockResolvedValue([]);
    const result = await listConnectedApps("user-1");
    expect(result).toEqual([]);
    expect(prisma.oauthApplication.findMany).not.toHaveBeenCalled();
  });

  it("joins consents with their application name, scoped to the user", async () => {
    vi.mocked(prisma.oauthConsent.findMany).mockResolvedValue([
      {
        clientId: "client-1",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ] as never);
    vi.mocked(prisma.oauthApplication.findMany).mockResolvedValue([
      { clientId: "client-1", name: "Claude Desktop" },
    ] as never);

    const result = await listConnectedApps("user-1");

    expect(prisma.oauthConsent.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", consentGiven: true },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual([
      {
        clientId: "client-1",
        name: "Claude Desktop",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });

  it("falls back to a generic name when the application row is missing", async () => {
    vi.mocked(prisma.oauthConsent.findMany).mockResolvedValue([
      { clientId: "client-2", createdAt: new Date("2026-07-01T00:00:00.000Z") },
    ] as never);
    vi.mocked(prisma.oauthApplication.findMany).mockResolvedValue([]);

    const result = await listConnectedApps("user-1");
    expect(result).toEqual([
      {
        clientId: "client-2",
        name: "Unknown app",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("revokeConnectedApp", () => {
  beforeEach(() => {
    vi.mocked(prisma.oauthAccessToken.deleteMany).mockReset();
    vi.mocked(prisma.oauthConsent.deleteMany).mockReset();
  });

  it("deletes access tokens and the consent record scoped to the user and client", async () => {
    vi.mocked(prisma.oauthConsent.deleteMany).mockResolvedValue({ count: 1 } as never);

    await revokeConnectedApp("user-1", "client-1");

    expect(prisma.oauthAccessToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
    expect(prisma.oauthConsent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
  });

  it("returns false when there was nothing to revoke", async () => {
    vi.mocked(prisma.oauthConsent.deleteMany).mockResolvedValue({ count: 0 } as never);
    const result = await revokeConnectedApp("user-1", "client-1");
    expect(result).toBe(false);
  });

  it("returns true when a consent record was deleted", async () => {
    vi.mocked(prisma.oauthConsent.deleteMany).mockResolvedValue({ count: 1 } as never);
    const result = await revokeConnectedApp("user-1", "client-1");
    expect(result).toBe(true);
  });
});
