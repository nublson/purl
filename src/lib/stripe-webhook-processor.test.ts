import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    processedStripeEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const {
  isStripeEventProcessed,
  recordStripeEventProcessed,
} = await import("./stripe-webhook-processor");

describe("stripe webhook idempotency helpers", () => {
  it("isStripeEventProcessed returns true when row exists", async () => {
    vi.mocked(prisma.processedStripeEvent.findUnique).mockResolvedValue({
      id: "evt_1",
      type: "checkout.session.completed",
      receivedAt: new Date(),
    } as never);

    await expect(isStripeEventProcessed("evt_1")).resolves.toBe(true);
  });

  it("recordStripeEventProcessed inserts row", async () => {
    vi.mocked(prisma.processedStripeEvent.create).mockResolvedValue({} as never);
    await recordStripeEventProcessed("evt_2", "test");
    expect(prisma.processedStripeEvent.create).toHaveBeenCalledWith({
      data: { id: "evt_2", type: "test" },
    });
  });
});
