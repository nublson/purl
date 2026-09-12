import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFindUnique = vi.fn();
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
      findUnique: mockFindUnique,
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
      user: { id: "user-1" },
    });
    mockFindUnique.mockResolvedValue({
      stripeCustomerId: "cus_existing",
    });
    mockPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the user has no Stripe customer id", async () => {
    mockFindUnique.mockResolvedValue({ stripeCustomerId: null });
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No billing account yet. Subscribe first.",
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when subscription row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(400);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("creates a billing portal session for an authenticated subscriber", async () => {
    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://billing.stripe.com/session",
    });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://app.purl.test/home",
    });
  });
});
