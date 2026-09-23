import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlements", () => ({
  getEntitlementContext: vi.fn(),
}));

vi.mock("@/lib/usage", () => ({
  countUsage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { count: vi.fn() },
  },
}));

const { getEntitlementContext } = await import("@/lib/entitlements");
const { countUsage } = await import("@/lib/usage");
const prisma = (await import("@/lib/prisma")).default;
const { getUsageSummaryForUser } = await import("./usage-summary");

describe("getUsageSummaryForUser", () => {
  beforeEach(() => {
    vi.mocked(getEntitlementContext).mockReset();
    vi.mocked(countUsage).mockReset();
    vi.mocked(prisma.link.count).mockReset();
  });

  it("returns save count and caps for a free user without querying extraction usage", async () => {
    vi.mocked(getEntitlementContext).mockResolvedValue({
      effectivePlanKey: "FREE",
      entitlements: {
        maxLifetimeSaves: 100,
        maxExtractionsPerPeriod: 0,
      },
      billing: { planKey: "FREE", status: "ACTIVE", compUntil: null, trialEndsAt: null },
    } as never);
    vi.mocked(prisma.link.count).mockResolvedValue(42);

    const summary = await getUsageSummaryForUser("user-1");

    expect(summary).toEqual({
      effectivePlanKey: "FREE",
      saves: { used: 42, cap: 100 },
      extractions: { used: 0, cap: 0 },
    });
    expect(prisma.link.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(countUsage).not.toHaveBeenCalled();
  });

  it("counts extraction usage for pro users since the start of the UTC month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));

    vi.mocked(getEntitlementContext).mockResolvedValue({
      effectivePlanKey: "PRO",
      entitlements: {
        maxLifetimeSaves: null,
        maxExtractionsPerPeriod: 150,
      },
      billing: { planKey: "PRO", status: "ACTIVE", compUntil: null, trialEndsAt: null },
    } as never);
    vi.mocked(prisma.link.count).mockResolvedValue(250);
    vi.mocked(countUsage).mockResolvedValueOnce(7);

    const summary = await getUsageSummaryForUser("user-pro");

    expect(summary).toEqual({
      effectivePlanKey: "PRO",
      saves: { used: 250, cap: null },
      extractions: { used: 7, cap: 150 },
    });

    const expectedSince = new Date(Date.UTC(2025, 5, 1));
    expect(countUsage).toHaveBeenCalledOnce();
    expect(countUsage).toHaveBeenCalledWith("user-pro", "EXTRACT", {
      since: expectedSince,
    });

    vi.useRealTimers();
  });

  it("skips usage queries when caps are null (unlimited)", async () => {
    vi.mocked(getEntitlementContext).mockResolvedValue({
      effectivePlanKey: "PRO",
      entitlements: {
        maxLifetimeSaves: null,
        maxExtractionsPerPeriod: null,
      },
      billing: { planKey: "PRO", status: "ACTIVE", compUntil: null, trialEndsAt: null },
    } as never);
    vi.mocked(prisma.link.count).mockResolvedValue(10);

    const summary = await getUsageSummaryForUser("user-unlimited");

    expect(summary.extractions).toEqual({ used: 0, cap: null });
    expect(countUsage).not.toHaveBeenCalled();
  });
});
