import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockEnsureSubscriptionRow = vi.fn();
const mockCustomerCreate = vi.fn();
const mockCheckoutCreate = vi.fn();
const mockSubscriptionUpdate = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/lib/subscription-utils", () => ({
  ensureSubscriptionRow: mockEnsureSubscriptionRow,
}));

vi.mock("@/lib/plans", () => ({
  getStripeOneTimePriceId: vi.fn(() => "price_onetime"),
}));

vi.mock("@/lib/billing-url", () => ({
  getAppBaseUrl: vi.fn(() => "https://app.purl.test"),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: {
      update: mockSubscriptionUpdate,
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    customers: { create: mockCustomerCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
  })),
}));

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    mockCheckoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
    mockSubscriptionUpdate.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("reuses existing Stripe customer id", async () => {
    mockEnsureSubscriptionRow.mockResolvedValue({
      stripeCustomerId: "cus_existing",
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.com/session",
    });
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer: "cus_existing",
        client_reference_id: "user-1",
        line_items: [{ price: "price_onetime", quantity: 1 }],
        success_url: "https://app.purl.test/home?checkout=success",
        cancel_url: "https://app.purl.test/home?checkout=canceled",
      }),
    );
  });

  it("creates a Stripe customer when subscription row has none", async () => {
    mockEnsureSubscriptionRow.mockResolvedValue({ stripeCustomerId: null });
    mockCustomerCreate.mockResolvedValue({ id: "cus_new" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCustomerCreate).toHaveBeenCalledWith({
      email: "user@example.com",
      metadata: { userId: "user-1" },
    });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { stripeCustomerId: "cus_new" },
    });
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new" }),
    );
  });

  it("returns 500 when checkout session has no url", async () => {
    mockEnsureSubscriptionRow.mockResolvedValue({
      stripeCustomerId: "cus_existing",
    });
    mockCheckoutCreate.mockResolvedValue({ url: null });

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Checkout session missing URL",
    });
  });
});
