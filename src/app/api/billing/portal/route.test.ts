import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBrowserSessionUserId = vi.fn();
const mockFindUnique = vi.fn();
const mockPortalCreate = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/require-browser-session", () => ({
  getBrowserSessionUserId: mockGetBrowserSessionUserId,
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
    billingPortal: { sessions: { create: mockPortalCreate } },
  })),
}));

const { POST } = await import("./route");

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrowserSessionUserId.mockResolvedValue("user-1");
    mockFindUnique.mockResolvedValue({ stripeCustomerId: "cus_existing" });
    mockPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/portal",
    });
  });

  it("returns 401 when there is no browser session", async () => {
    mockGetBrowserSessionUserId.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the user has no Stripe customer yet", async () => {
    mockFindUnique.mockResolvedValue({ stripeCustomerId: null });

    const res = await POST();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No billing account yet. Subscribe first.",
    });
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the subscription row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No billing account yet. Subscribe first.",
    });
  });

  it("creates a billing portal session for a browser-authenticated user", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://billing.stripe.com/portal",
    });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://app.purl.test/home",
    });
  });
});
