import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mockConstructEvent = vi.fn();
const mockIsProcessed = vi.fn();
const mockProcessEvent = vi.fn();
const mockRecordProcessed = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  })),
}));

vi.mock("@/lib/stripe-webhook-processor", () => ({
  isStripeEventProcessed: mockIsProcessed,
  processStripeEvent: mockProcessEvent,
  recordStripeEventProcessed: mockRecordProcessed,
}));

function makeRequest(
  body: string,
  headers?: Record<string, string>,
): Request {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    body,
    headers,
  });
}

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mockIsProcessed.mockResolvedValue(false);
    mockProcessEvent.mockResolvedValue(undefined);
    mockRecordProcessed.mockResolvedValue(undefined);
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const { POST } = await import("./route");
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "STRIPE_WEBHOOK_SECRET not configured",
    });
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing signature" });
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest("{}", { "stripe-signature": "sig_bad" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("short-circuits duplicate events without reprocessing", async () => {
    const event = { id: "evt_dup", type: "checkout.session.completed" };
    mockConstructEvent.mockReturnValue(event);
    mockIsProcessed.mockResolvedValue(true);

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest("{}", { "stripe-signature": "sig_ok" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(mockRecordProcessed).not.toHaveBeenCalled();
  });

  it("processes a new event and records idempotency", async () => {
    const event = {
      id: "evt_new",
      type: "checkout.session.completed",
    } as Stripe.Event;
    mockConstructEvent.mockReturnValue(event);

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest("{}", { "stripe-signature": "sig_ok" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockProcessEvent).toHaveBeenCalledWith(event);
    expect(mockRecordProcessed).toHaveBeenCalledWith(
      "evt_new",
      "checkout.session.completed",
    );
  });

  it("returns 500 when handler fails without recording the event", async () => {
    const event = { id: "evt_fail", type: "checkout.session.completed" };
    mockConstructEvent.mockReturnValue(event);
    mockProcessEvent.mockRejectedValue(new Error("handler failed"));

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest("{}", { "stripe-signature": "sig_ok" }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Webhook handler failed" });
    expect(mockRecordProcessed).not.toHaveBeenCalled();
  });
});
