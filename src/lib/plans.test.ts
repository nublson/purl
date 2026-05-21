import type { PlanKey } from "@/generated/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  entitlementsForPlanKey,
  FREE_CHAT_MESSAGES_PER_PERIOD,
  FREE_CHAT_PERIOD_DAYS,
  FREE_LIFETIME_SAVE_CAP,
  getStripePriceIdForBillingInterval,
  PRO_EXTRACTIONS_PER_PERIOD,
  publicPlans,
  stripePriceIdToPlanKey,
} from "./plans";

describe("stripePriceIdToPlanKey", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_monthly_test");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "  price_annual_test  ");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps configured monthly and annual price IDs to PRO", () => {
    expect(stripePriceIdToPlanKey("price_monthly_test")).toBe("PRO");
    expect(stripePriceIdToPlanKey("price_annual_test")).toBe("PRO");
  });

  it("returns null for unknown or empty price IDs", () => {
    expect(stripePriceIdToPlanKey("price_other")).toBeNull();
    expect(stripePriceIdToPlanKey("")).toBeNull();
  });

  it("returns null when Stripe price env vars are unset", () => {
    vi.unstubAllEnvs();
    expect(stripePriceIdToPlanKey("price_monthly_test")).toBeNull();
  });
});

describe("getStripePriceIdForBillingInterval", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns trimmed monthly price id", () => {
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "  price_m  ");
    expect(getStripePriceIdForBillingInterval("month")).toBe("price_m");
  });

  it("returns trimmed annual price id", () => {
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_y");
    expect(getStripePriceIdForBillingInterval("year")).toBe("price_y");
  });

  it("throws a clear error when the monthly price env is missing", () => {
    expect(() => getStripePriceIdForBillingInterval("month")).toThrow(
      "Missing Stripe price env: STRIPE_PRICE_PRO_MONTHLY",
    );
  });

  it("throws a clear error when the annual price env is missing", () => {
    expect(() => getStripePriceIdForBillingInterval("year")).toThrow(
      "Missing Stripe price env: STRIPE_PRICE_PRO_ANNUAL",
    );
  });
});

describe("entitlementsForPlanKey", () => {
  it("FREE tier caps saves, chat, and blocks extractions/uploads", () => {
    const e = entitlementsForPlanKey("FREE");
    expect(e.aiFullAccess).toBe(false);
    expect(e.maxLifetimeSaves).toBe(FREE_LIFETIME_SAVE_CAP);
    expect(e.maxExtractionsPerPeriod).toBe(0);
    expect(e.maxChatMessagesPerPeriod).toBe(FREE_CHAT_MESSAGES_PER_PERIOD);
    expect(e.chatPeriodDays).toBe(FREE_CHAT_PERIOD_DAYS);
    expect(e.extractionPeriodUsesSubscriptionPeriod).toBe(false);
    expect(e.allowFileUploads).toBe(false);
  });

  it("PRO and PRO_TRIAL share full AI entitlements with extraction cap", () => {
    for (const key of ["PRO", "PRO_TRIAL"] as const) {
      const e = entitlementsForPlanKey(key);
      expect(e.aiFullAccess).toBe(true);
      expect(e.maxLifetimeSaves).toBeNull();
      expect(e.maxExtractionsPerPeriod).toBe(PRO_EXTRACTIONS_PER_PERIOD);
      expect(e.maxChatMessagesPerPeriod).toBeNull();
      expect(e.chatPeriodDays).toBeNull();
      expect(e.extractionPeriodUsesSubscriptionPeriod).toBe(true);
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

  it("keeps Pro extraction copy aligned with PRO_EXTRACTIONS_PER_PERIOD", () => {
    const pro = publicPlans.find((p) => p.id === "PRO");
    expect(pro).toBeDefined();
    const extractLine = pro!.features.find((f) =>
      f.includes("content extractions"),
    );
    expect(extractLine).toContain(String(PRO_EXTRACTIONS_PER_PERIOD));
  });
});
