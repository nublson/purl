import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: { update: vi.fn() },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { applyOneTimePaymentToUser } = await import("./stripe-sync");

describe("applyOneTimePaymentToUser", () => {
  beforeEach(() => {
    vi.mocked(prisma.subscription.update).mockReset();
    vi.mocked(prisma.subscription.update).mockResolvedValue({} as never);
  });

  it("upgrades the user subscription to PRO with Stripe customer and price IDs", async () => {
    await applyOneTimePaymentToUser("user-1", "cus_abc", "price_onetime");

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        planKey: "PRO",
        status: "ACTIVE",
        stripeCustomerId: "cus_abc",
        stripePriceId: "price_onetime",
      },
    });
  });
});
