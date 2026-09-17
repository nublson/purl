import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

const mockEnsureSubscriptionRow = vi.fn();
vi.mock("@/lib/subscription-utils", () => ({
  ensureSubscriptionRow: mockEnsureSubscriptionRow,
}));

vi.mock("@/lib/plans", () => ({
  getStripeOneTimePriceId: vi.fn(() => "price_onetime"),
}));

vi.mock("@/lib/billing-url", () => ({
  getAppBaseUrl: vi.fn(() => "https://app.purl.test"),
}));

const mockSubscriptionUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: {
      update: mockSubscriptionUpdate,
    },
  },
}));

const mockCheckoutCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    customers: { create: vi.fn() },
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

describe("POST /api/billing/checkout browser-session guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureSubscriptionRow.mockResolvedValue({
      stripeCustomerId: "cus_existing",
    });
    mockCheckoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
  });

  it("returns 401 for API-key-only requests without calling Stripe", async () => {
    mockHeaders.mockResolvedValue(
      new Headers({ authorization: "Bearer purl_leaked_key" }),
    );
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      session: {},
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });
});
