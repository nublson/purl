import type { Prisma } from "@/generated/prisma/client";
import type { PlanKey } from "@/generated/prisma/enums";
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
}) {
  return {
    userId: "u1",
    planKey: overrides.planKey ?? "FREE",
    status: overrides.status ?? "ACTIVE",
    trialEndsAt: overrides.trialEndsAt ?? null,
    compUntil: overrides.compUntil ?? null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
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

    vi.mocked(prisma.subscription.findUnique).mockImplementation(
      (async () => null) as unknown as typeof prisma.subscription.findUnique,
    );
    vi.mocked(prisma.subscription.create).mockImplementation(
      (async (args: Prisma.SubscriptionCreateArgs) => {
        const { data } = args;
        return mockSub({
          planKey: data.planKey as PlanKey,
          status: data.status as "ACTIVE",
          trialEndsAt: data.trialEndsAt as Date | null,
        });
      }) as unknown as typeof prisma.subscription.create,
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

  it("shouldRunIngest skips free users (no AI access)", async () => {
    const uid = "user-ingest-skip";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "FREE" }), userId: uid } as never,
    );

    const r = await shouldRunIngest(uid);
    expect(r.run).toBe(false);
    expect(r.skipReason).toBe("free_metadata_only");
  });

  it("shouldRunIngest runs for PRO users with unlimited extractions", async () => {
    const uid = "user-pro-ingest";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      {
        ...mockSub({ planKey: "PRO", status: "ACTIVE" }),
        userId: uid,
      } as never,
    );

    const r = await shouldRunIngest(uid);
    expect(r.run).toBe(true);
    expect(prisma.usageEvent.count).not.toHaveBeenCalled();
  });

  it("assertCanChat always blocks free users without a DB query", async () => {
    const uid = "user-chat-free";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "FREE" }), userId: uid } as never,
    );

    await expect(assertCanChat(uid)).rejects.toBeInstanceOf(BillingLimitError);
    expect(prisma.usageEvent.count).not.toHaveBeenCalled();
  });

  it("assertCanChat allows PRO users", async () => {
    const uid = "user-chat-pro";
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(
      { ...mockSub({ planKey: "PRO", status: "ACTIVE" }), userId: uid } as never,
    );

    await expect(assertCanChat(uid)).resolves.toBeUndefined();
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
