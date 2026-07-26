import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/stripe-sync", () => ({
  applyOneTimePaymentToUser: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    processedStripeEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { applyOneTimePaymentToUser } = await import("@/lib/stripe-sync");
const { getStripe } = await import("@/lib/stripe");
const {
  isStripeEventProcessed,
  processStripeEvent,
  recordStripeEventProcessed,
} = await import("./stripe-webhook-processor");

const mockRetrieveSession = vi.fn();

beforeEach(() => {
  vi.mocked(getStripe).mockReturnValue({
    checkout: {
      sessions: {
        retrieve: mockRetrieveSession,
      },
    },
  } as never);
  vi.mocked(applyOneTimePaymentToUser).mockReset();
  mockRetrieveSession.mockReset();
});

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

describe("processStripeEvent", () => {
  it("upgrades user on checkout.session.completed with expanded price", async () => {
    mockRetrieveSession.mockResolvedValue({
      line_items: { data: [{ price: { id: "price_onetime" } }] },
    });

    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id: "user-1",
          customer: "cus_abc",
        },
      },
    } as Stripe.Event;

    await processStripeEvent(event);

    expect(mockRetrieveSession).toHaveBeenCalledWith("cs_test", {
      expand: ["line_items"],
    });
    expect(applyOneTimePaymentToUser).toHaveBeenCalledWith(
      "user-1",
      "cus_abc",
      "price_onetime",
    );
  });

  it("resolves customer id from expanded customer object", async () => {
    mockRetrieveSession.mockResolvedValue({
      line_items: { data: [{ price: { id: "price_onetime" } }] },
    });

    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id: "user-1",
          customer: { id: "cus_expanded" },
        },
      },
    } as Stripe.Event;

    await processStripeEvent(event);

    expect(applyOneTimePaymentToUser).toHaveBeenCalledWith(
      "user-1",
      "cus_expanded",
      "price_onetime",
    );
  });

  it("skips upgrade when client_reference_id is missing", async () => {
    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          customer: "cus_abc",
        },
      },
    } as Stripe.Event;

    await processStripeEvent(event);

    expect(mockRetrieveSession).not.toHaveBeenCalled();
    expect(applyOneTimePaymentToUser).not.toHaveBeenCalled();
  });

  it("skips upgrade when customer id is missing", async () => {
    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id: "user-1",
        },
      },
    } as Stripe.Event;

    await processStripeEvent(event);

    expect(mockRetrieveSession).not.toHaveBeenCalled();
    expect(applyOneTimePaymentToUser).not.toHaveBeenCalled();
  });

  it("ignores unhandled event types", async () => {
    const event = {
      id: "evt_other",
      type: "customer.created",
      data: { object: {} },
    } as Stripe.Event;

    await processStripeEvent(event);

    expect(applyOneTimePaymentToUser).not.toHaveBeenCalled();
  });

  it("rethrows handler errors after reporting to Sentry", async () => {
    const sentry = await import("@sentry/nextjs");
    mockRetrieveSession.mockRejectedValue(new Error("stripe down"));

    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          client_reference_id: "user-1",
          customer: "cus_abc",
        },
      },
    } as Stripe.Event;

    await expect(processStripeEvent(event)).rejects.toThrow("stripe down");
    expect(sentry.captureException).toHaveBeenCalled();
  });
});
