import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const {
  ensureSubscriptionRow,
  resolveEffectiveBillingState,
} = await import("./subscription-utils");

function baseSub(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    planKey: "FREE" as const,
    status: "ACTIVE" as const,
    trialEndsAt: null,
    compUntil: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    cancelAtPeriodEnd: false,
    trialEndingNotifiedAt: null,
    updatedAt: new Date(),
    id: "sub-1",
    ...overrides,
  };
}

describe("ensureSubscriptionRow", () => {
  beforeEach(() => {
    vi.mocked(prisma.subscription.findUnique).mockReset();
    vi.mocked(prisma.subscription.create).mockReset();
  });

  it("returns the existing row without creating a duplicate", async () => {
    const row = baseSub();
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(row as never);

    const result = await ensureSubscriptionRow("user-1");

    expect(result).toBe(row);
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it("creates a FREE subscription when none exists", async () => {
    const created = baseSub();
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subscription.create).mockResolvedValue(created as never);

    const result = await ensureSubscriptionRow("user-new");

    expect(prisma.subscription.create).toHaveBeenCalledWith({
      data: {
        userId: "user-new",
        planKey: "FREE",
        status: "ACTIVE",
      },
    });
    expect(result).toBe(created);
  });
});

describe("resolveEffectiveBillingState", () => {
  beforeEach(() => {
    vi.mocked(prisma.subscription.findUnique).mockReset();
    vi.mocked(prisma.subscription.create).mockReset();
    vi.mocked(prisma.subscription.update).mockReset();
    vi.mocked(prisma.subscription.updateMany).mockReset();
  });

  it("treats compUntil in the future as effective PRO regardless of stored plan", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      baseSub({ planKey: "FREE", compUntil: future }) as never,
    );

    const state = await resolveEffectiveBillingState("user-1");

    expect(state.planKey).toBe("PRO");
    expect(state.compUntil).toEqual(future);
  });

  it("returns PRO for a user who paid the one-time fee", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      baseSub({ planKey: "PRO", status: "ACTIVE", stripePriceId: "price_onetime" }) as never,
    );

    const state = await resolveEffectiveBillingState("user-1");

    expect(state.planKey).toBe("PRO");
    expect(state.status).toBe("ACTIVE");
  });

  it("returns PRO_TRIAL for existing trial users while still active", async () => {
    const trialEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      baseSub({ planKey: "PRO_TRIAL", status: "TRIALING", trialEndsAt }) as never,
    );

    const state = await resolveEffectiveBillingState("user-1");

    expect(state.planKey).toBe("PRO_TRIAL");
  });

  it("downgrades expired PRO_TRIAL to FREE", async () => {
    const trialEndsAt = new Date(Date.now() - 60_000);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      baseSub({ planKey: "PRO_TRIAL", status: "TRIALING", trialEndsAt }) as never,
    );
    vi.mocked(prisma.subscription.update).mockResolvedValue({} as never);

    const state = await resolveEffectiveBillingState("user-1");

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { planKey: "FREE", status: "ACTIVE" },
    });
    expect(state.planKey).toBe("FREE");
    expect(state.status).toBe("ACTIVE");
  });

  it("demotes lapsed PRO (e.g. canceled) to FREE and clears Stripe fields", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      baseSub({ planKey: "PRO", status: "CANCELED", stripePriceId: "price_x" }) as never,
    );
    vi.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 1 } as never);

    const state = await resolveEffectiveBillingState("user-1");

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", planKey: "PRO" },
      data: {
        planKey: "FREE",
        status: "ACTIVE",
        stripeSubscriptionId: null,
        stripePriceId: null,
      },
    });
    expect(state.planKey).toBe("FREE");
    expect(state.status).toBe("ACTIVE");
  });
});
