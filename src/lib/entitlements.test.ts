import type { PlanKey } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { count: vi.fn() },
    usageEvent: { count: vi.fn() },
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
  assertCanSaveLink,
  assertCanChat,
  shouldRunIngest,
  getEntitlementContext,
  BillingLimitError,
} = await import("./entitlements");

function mockSub(overrides: {
  planKey?: PlanKey;
  status?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "INCOMPLETE";
  trialEndsAt?: Date | null;
  compUntil?: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}) {
  return {
    userId: "u1",
    planKey: overrides.planKey ?? "FREE",
    status: overrides.status ?? "ACTIVE",
    trialEndsAt: overrides.trialEndsAt ?? null,
    compUntil: overrides.compUntil ?? null,
    currentPeriodStart: overrides.currentPeriodStart ?? null,
    currentPeriodEnd: overrides.currentPeriodEnd ?? null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    cancelAtPeriodEnd: false,
    trialEndingNotifiedAt: null,
    updatedAt: new Date(),
    id: "sub1",
  };
}

describe("entitlements", () => {
  beforeEach(() => {
    vi.mocked(prisma.subscription.findUnique).mockReset();
    vi.mocked(prisma.subscription.create).mockReset();
    vi.mocked(prisma.subscription.update).mockReset();
    vi.mocked(prisma.subscription.updateMany).mockReset();
    vi.mocked(prisma.link.count).mockReset();
    vi.mocked(prisma.usageEvent.count).mockReset();

    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.subscription.create).mockImplementation(
      (({ data }: Prisma.SubscriptionCreateArgs) =>
        Promise.resolve(
          mockSub({
            planKey: data.planKey as PlanKey,
            status: data.status as "ACTIVE",
            trialEndsAt: data.trialEndsAt as Date | null,
          }),
        )) as unknown as typeof prisma.subscription.create,
    );
  });

  it("assertCanSaveLink allows when under free cap", async () => {
    const uid = "user-save-ok";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "FREE" }), userId: uid } as never,
    );
    vi.mocked(prisma.link.count).mockResolvedValue(50);

    await expect(assertCanSaveLink(uid)).resolves.toBeUndefined();
  });

  it("assertCanSaveLink throws at free cap", async () => {
    const uid = "user-save-cap";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "FREE" }), userId: uid } as never,
    );
    vi.mocked(prisma.link.count).mockResolvedValue(100);

    await expect(assertCanSaveLink(uid)).rejects.toBeInstanceOf(
      BillingLimitError,
    );
  });

  it("shouldRunIngest skips when no ai access", async () => {
    const uid = "user-ingest-skip";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "FREE" }), userId: uid } as never,
    );

    const r = await shouldRunIngest(uid);
    expect(r.run).toBe(false);
    expect(r.skipReason).toBe("free_metadata_only");
  });

  it("assertCanChat enforces free tier message cap", async () => {
    const uid = "user-chat-cap";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "FREE" }), userId: uid } as never,
    );
    vi.mocked(prisma.usageEvent.count).mockResolvedValue(20);

    await expect(assertCanChat(uid)).rejects.toBeInstanceOf(BillingLimitError);
  });

  it("compUntil grants PRO entitlements via getEntitlementContext", async () => {
    const uid = "user-comp";
    const future = new Date(Date.now() + 86400000);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      {
        ...mockSub({
          planKey: "FREE",
          compUntil: future,
        }),
        userId: uid,
      } as never,
    );

    const ctx = await getEntitlementContext(uid);
    expect(ctx.entitlements.aiFullAccess).toBe(true);
  });
});
