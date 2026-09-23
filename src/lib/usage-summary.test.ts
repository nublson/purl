import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlements", () => ({
  getEntitlementContext: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { count: vi.fn() },
  },
}));

const { getEntitlementContext } = await import("@/lib/entitlements");
const prisma = (await import("@/lib/prisma")).default;
const { getUsageSummaryForUser } = await import("./usage-summary");

describe("getUsageSummaryForUser", () => {
  beforeEach(() => {
    vi.mocked(getEntitlementContext).mockReset();
    vi.mocked(prisma.link.count).mockReset();
  });

  it("returns the save count and cap for a free user", async () => {
    vi.mocked(getEntitlementContext).mockResolvedValue({
      effectivePlanKey: "FREE",
      entitlements: { maxLifetimeSaves: 100, allowFileUploads: false },
      billing: { planKey: "FREE", status: "ACTIVE", compUntil: null, trialEndsAt: null },
    } as never);
    vi.mocked(prisma.link.count).mockResolvedValue(42);

    const summary = await getUsageSummaryForUser("user-1");

    expect(summary).toEqual({
      effectivePlanKey: "FREE",
      saves: { used: 42, cap: 100 },
    });
    expect(prisma.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("reports an unlimited save cap for pro users", async () => {
    vi.mocked(getEntitlementContext).mockResolvedValue({
      effectivePlanKey: "PRO",
      entitlements: { maxLifetimeSaves: null, allowFileUploads: true },
      billing: { planKey: "PRO", status: "ACTIVE", compUntil: null, trialEndsAt: null },
    } as never);
    vi.mocked(prisma.link.count).mockResolvedValue(250);

    const summary = await getUsageSummaryForUser("user-pro");

    expect(summary).toEqual({
      effectivePlanKey: "PRO",
      saves: { used: 250, cap: null },
    });
  });
});
