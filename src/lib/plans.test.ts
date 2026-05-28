import type { PlanKey } from "@/generated/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  entitlementsForPlanKey,
  FREE_LIFETIME_SAVE_CAP,
  getStripeOneTimePriceId,
  PRO_ONETIME_PRICE_CENTS,
  publicPlans,
  stripePriceIdToPlanKey,
} from "./plans";

describe("stripePriceIdToPlanKey", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PRO_ONETIME", "price_onetime_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps configured one-time price ID to PRO", () => {
    expect(stripePriceIdToPlanKey("price_onetime_test")).toBe("PRO");
  });

  it("returns null for unknown or empty price IDs", () => {
    expect(stripePriceIdToPlanKey("price_other")).toBeNull();
    expect(stripePriceIdToPlanKey("")).toBeNull();
  });

  it("returns null when Stripe price env var is unset", () => {
    vi.unstubAllEnvs();
    expect(stripePriceIdToPlanKey("price_onetime_test")).toBeNull();
  });
});

describe("getStripeOneTimePriceId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the one-time price ID", () => {
    vi.stubEnv("STRIPE_PRICE_PRO_ONETIME", "  price_onetime  ");
    expect(getStripeOneTimePriceId()).toBe("price_onetime");
  });

  it("throws a clear error when the env var is missing", () => {
    expect(() => getStripeOneTimePriceId()).toThrow(
      "Missing Stripe price env: STRIPE_PRICE_PRO_ONETIME",
    );
  });
});

describe("entitlementsForPlanKey", () => {
  it("FREE tier caps saves, blocks AI and chat", () => {
    const e = entitlementsForPlanKey("FREE");
    expect(e.aiFullAccess).toBe(false);
    expect(e.maxLifetimeSaves).toBe(FREE_LIFETIME_SAVE_CAP);
    expect(e.maxExtractionsPerPeriod).toBe(0);
    expect(e.maxChatMessagesPerPeriod).toBe(0);
    expect(e.chatPeriodDays).toBeNull();
    expect(e.extractionPeriodUsesSubscriptionPeriod).toBe(false);
    expect(e.allowFileUploads).toBe(false);
  });

  it("PRO and PRO_TRIAL share full AI entitlements with no caps", () => {
    for (const key of ["PRO", "PRO_TRIAL"] as const) {
      const e = entitlementsForPlanKey(key);
      expect(e.aiFullAccess).toBe(true);
      expect(e.maxLifetimeSaves).toBeNull();
      expect(e.maxExtractionsPerPeriod).toBeNull();
      expect(e.maxChatMessagesPerPeriod).toBeNull();
      expect(e.chatPeriodDays).toBeNull();
      expect(e.extractionPeriodUsesSubscriptionPeriod).toBe(false);
      expect(e.allowFileUploads).toBe(true);
    }
  });

  it("exhaustively handles every PlanKey (compile-time guard)", () => {
    const keys = ["FREE", "PRO", "PRO_TRIAL"] as const satisfies readonly PlanKey[];
    for (const k of keys) {
      expect(entitlementsForPlanKey(k)).toBeDefined();
    }
  });
});

describe("publicPlans catalog", () => {
  it("keeps free-tier marketing copy aligned with FREE_LIFETIME_SAVE_CAP", () => {
    const free = publicPlans.find((p) => p.id === "FREE");
    expect(free).toBeDefined();
    const saveLine = free!.features.find((f) => f.includes("Save up to"));
    expect(saveLine).toContain(String(FREE_LIFETIME_SAVE_CAP));
  });

  it("FREE tier features do not mention AI chat", () => {
    const free = publicPlans.find((p) => p.id === "FREE");
    expect(free).toBeDefined();
    const chatLine = free!.features.find((f) =>
      f.toLowerCase().includes("chat"),
    );
    expect(chatLine).toBeUndefined();
  });

  it("PRO plan shows one-time price aligned with PRO_ONETIME_PRICE_CENTS", () => {
    const pro = publicPlans.find((p) => p.id === "PRO");
    expect(pro).toBeDefined();
    expect(pro!.oneTimeCents).toBe(PRO_ONETIME_PRICE_CENTS);
    expect(pro!.priceSubLabel).toBe("one-time");
  });
});
