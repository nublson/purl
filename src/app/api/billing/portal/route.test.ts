import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockSubscriptionFindUnique = vi.fn();
const mockPortalCreate = vi.fn();

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

vi.mock("@/lib/billing-url", () => ({
  getAppBaseUrl: vi.fn(() => "https://app.purl.test"),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: {
      findUnique: mockSubscriptionFindUnique,
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    billingPortal: {
      sessions: { create: mockPortalCreate },
    },
  })),
}));

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    mockPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/portal/session",
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the user has no Stripe customer yet", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ stripeCustomerId: null });
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No billing account yet. Subscribe first.",
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when no subscription row exists", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No billing account yet. Subscribe first.",
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("creates a billing portal session and returns its url", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      stripeCustomerId: "cus_existing",
    });
    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://billing.stripe.com/portal/session",
    });
    expect(mockSubscriptionFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://app.purl.test/home",
    });
  });
});
