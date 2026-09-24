import type { PlanKey } from "@/generated/prisma/enums";

export const FREE_LIFETIME_SAVE_CAP = 100;
export const PRO_ONETIME_PRICE_CENTS = 3900;

/** Billing catalog: Stripe price ID → paid plan (always PRO on one-time purchase). */
export function stripePriceIdToPlanKey(priceId: string): PlanKey | null {
  const oneTime = process.env.STRIPE_PRICE_PRO_ONETIME?.trim();
  if (oneTime && priceId === oneTime) return "PRO";
  return null;
}

export function getStripeOneTimePriceId(): string {
  const id = process.env.STRIPE_PRICE_PRO_ONETIME?.trim();
  if (!id) {
    throw new Error("Missing Stripe price env: STRIPE_PRICE_PRO_ONETIME");
  }
  return id;
}

/** Marketing + limit copy aligned with docs/commercial-model.md */
export type PublicPlan = {
  id: "FREE" | "PRO";
  name: string;
  description: string;
  priceLabel: string;
  priceSubLabel?: string;
  oneTimeCents: number | null;
  features: string[];
  actionText: string;
  popular: boolean;
};

export const publicPlans: PublicPlan[] = [
  {
    id: "FREE",
    name: "Base",
    description: "A clean, fast home for everything you want to read later.",
    priceLabel: "Free",
    oneTimeCents: null,
    features: [
      `Save up to ${FREE_LIFETIME_SAVE_CAP} links — Web, YouTube, PDF & Audio`,
      "Full-text search",
      "Basic metadata (title, favicon, description)",
    ],
    actionText: "Get started free",
    popular: false,
  },
  {
    id: "PRO",
    name: "Pro",
    description: "Keep every pearl you find, without limits.",
    priceLabel: "$39",
    priceSubLabel: "one-time",
    oneTimeCents: PRO_ONETIME_PRICE_CENTS,
    features: [
      "Unlimited saved links",
      "PDF & audio file uploads",
    ],
    actionText: "Try for free",
    popular: true,
  },
];

export type EffectiveEntitlements = {
  maxLifetimeSaves: number | null;
  allowFileUploads: boolean;
};

/**
 * Effective limits for a stored plan key (before comp/trial expiry logic).
 * PRO_TRIAL is treated like PRO in entitlements; trial window is subscription.trialEndsAt.
 */
export function entitlementsForPlanKey(
  planKey: PlanKey,
): EffectiveEntitlements {
  switch (planKey) {
    case "FREE":
      return {
        maxLifetimeSaves: FREE_LIFETIME_SAVE_CAP,
        allowFileUploads: false,
      };
    case "PRO_TRIAL":
    case "PRO":
      return {
        maxLifetimeSaves: null,
        allowFileUploads: true,
      };
    default: {
      const _exhaustive: never = planKey;
      return _exhaustive;
    }
  }
}

export const LIMIT_FEATURE_CODES = {
  SAVE_LIMIT: "SAVE_LIMIT",
  UPLOAD_NOT_ALLOWED: "UPLOAD_NOT_ALLOWED",
} as const;

export type LimitFeatureCode =
  (typeof LIMIT_FEATURE_CODES)[keyof typeof LIMIT_FEATURE_CODES];
