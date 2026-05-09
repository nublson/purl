import "server-only";

import type { PlanKey, SubStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates PRO_TRIAL subscription for new signups (Better Auth hook). */
export async function createTrialSubscriptionForNewUser(
  userId: string,
): Promise<void> {
  const trialEndsAt = new Date(Date.now() + TRIAL_MS);
  try {
    await prisma.subscription.create({
      data: {
        userId,
        planKey: "PRO_TRIAL",
        status: "TRIALING",
        trialEndsAt,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return;
    }
    throw e;
  }
}

/**
 * Ensures every user has a subscription row. Legacy users get FREE without a new trial.
 */
export async function ensureSubscriptionRow(userId: string) {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  return prisma.subscription.create({
    data: {
      userId,
      planKey: "FREE",
      status: "ACTIVE",
    },
  });
}

export type EffectiveBillingState = {
  planKey: PlanKey;
  status: SubStatus;
  trialEndsAt: Date | null;
  compUntil: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

/**
 * Resolves effective plan for limits: comp > paid PRO > active trial > FREE.
 * Lazily flips expired internal trial to FREE in DB.
 */
export async function resolveEffectiveBillingState(
  userId: string,
): Promise<EffectiveBillingState> {
  const sub = await ensureSubscriptionRow(userId);
  const now = new Date();

  if (sub.compUntil && sub.compUntil > now) {
    return {
      planKey: "PRO",
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      compUntil: sub.compUntil,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }

  if (
    sub.planKey === "PRO" &&
    (sub.status === "ACTIVE" || sub.status === "PAST_DUE")
  ) {
    return {
      planKey: "PRO",
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      compUntil: sub.compUntil,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }

  if (sub.planKey === "PRO_TRIAL" && sub.trialEndsAt && sub.trialEndsAt > now) {
    return {
      planKey: "PRO_TRIAL",
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      compUntil: sub.compUntil,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }

  if (sub.planKey === "PRO_TRIAL" && sub.trialEndsAt && sub.trialEndsAt <= now) {
    await prisma.subscription.update({
      where: { userId },
      data: {
        planKey: "FREE",
        status: "ACTIVE",
      },
    });
    return {
      planKey: "FREE",
      status: "ACTIVE",
      trialEndsAt: null,
      compUntil: sub.compUntil,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
  }

  if (sub.planKey === "PRO") {
    await prisma.subscription.updateMany({
      where: { userId, planKey: "PRO" },
      data: {
        planKey: "FREE",
        status: "ACTIVE",
        stripeSubscriptionId: null,
        stripePriceId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    });
    return {
      planKey: "FREE",
      status: "ACTIVE",
      trialEndsAt: sub.trialEndsAt,
      compUntil: sub.compUntil,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
  }

  return {
    planKey: "FREE",
    status: "ACTIVE",
    trialEndsAt: sub.trialEndsAt,
    compUntil: sub.compUntil,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
  };
}
