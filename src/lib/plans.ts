import type { PlanKey } from "@/generated/prisma/enums";

/** Billing catalog: Stripe price IDs → paid plan (always PRO on subscription). */
export function stripePriceIdToPlanKey(priceId: string): PlanKey | null {
  const monthly = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  const annual = process.env.STRIPE_PRICE_PRO_ANNUAL?.trim();
  if (monthly && priceId === monthly) return "PRO";
  if (annual && priceId === annual) return "PRO";
  return null;
}

export function getStripePriceIdForBillingInterval(
  interval: "month" | "year",
): string {
  const key =
    interval === "year"
      ? process.env.STRIPE_PRICE_PRO_ANNUAL
      : process.env.STRIPE_PRICE_PRO_MONTHLY;
  const id = key?.trim();
  if (!id) {
    throw new Error(
      `Missing Stripe price env: ${interval === "year" ? "STRIPE_PRICE_PRO_ANNUAL" : "STRIPE_PRICE_PRO_MONTHLY"}`,
    );
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
  /** Monthly amount in cents for Pro (display); annual derived in UI */
  monthlyAmountCents: number | null;
  annualAmountCents: number | null;
  features: string[];
  actionText: string;
  popular: boolean;
};

export const FREE_LIFETIME_SAVE_CAP = 100;
export const FREE_CHAT_MESSAGES_PER_PERIOD = 20;
/** Rolling window for free-tier chat counting (days). */
export const FREE_CHAT_PERIOD_DAYS = 30;
export const PRO_EXTRACTIONS_PER_PERIOD = 400;

export const publicPlans: PublicPlan[] = [
  {
    id: "FREE",
    name: "Base",
    description: "A clean, fast home for everything you want to read later.",
    priceLabel: "Free",
    monthlyAmountCents: null,
    annualAmountCents: null,
    features: [
      "Save up to 100 links — Web, YouTube, PDF & Audio",
      "20 AI chat messages / month",
      "Full-text search",
    ],
    actionText: "Get started free",
    popular: false,
  },
  {
    id: "PRO",
    name: "Pro",
    description: "Turn your saved content into a searchable AI knowledge base.",
    priceLabel: "$5",
    priceSubLabel: "/month",
    monthlyAmountCents: 500,
    annualAmountCents: 4900,
    features: [
      "Unlimited saved links",
      "400 AI content extractions / month",
      "AI-generated summaries",
      "PDF & audio file uploads",
      "YouTube & audio transcriptions",
      "Unlimited AI chat",
      "Semantic search",
    ],
    actionText: "Upgrade to Pro",
    popular: true,
  },
];

export type EffectiveEntitlements = {
  /** When true, user gets full AI ingest, semantic search, uploads, unlimited chat. */
  aiFullAccess: boolean;
  maxLifetimeSaves: number | null;
  maxExtractionsPerPeriod: number | null;
  maxChatMessagesPerPeriod: number | null;
  chatPeriodDays: number | null;
  extractionPeriodUsesSubscriptionPeriod: boolean;
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
        aiFullAccess: false,
        maxLifetimeSaves: FREE_LIFETIME_SAVE_CAP,
        maxExtractionsPerPeriod: 0,
        maxChatMessagesPerPeriod: FREE_CHAT_MESSAGES_PER_PERIOD,
        chatPeriodDays: FREE_CHAT_PERIOD_DAYS,
        extractionPeriodUsesSubscriptionPeriod: false,
        allowFileUploads: false,
      };
    case "PRO_TRIAL":
    case "PRO":
      return {
        aiFullAccess: true,
        maxLifetimeSaves: null,
        maxExtractionsPerPeriod: PRO_EXTRACTIONS_PER_PERIOD,
        maxChatMessagesPerPeriod: null,
        chatPeriodDays: null,
        extractionPeriodUsesSubscriptionPeriod: true,
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
  EXTRACT_LIMIT: "EXTRACT_LIMIT",
  CHAT_LIMIT: "CHAT_LIMIT",
  UPLOAD_NOT_ALLOWED: "UPLOAD_NOT_ALLOWED",
} as const;

export type LimitFeatureCode =
  (typeof LIMIT_FEATURE_CODES)[keyof typeof LIMIT_FEATURE_CODES];
