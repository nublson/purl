import "server-only";

import type { PlanKey, SubStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";

/**
 * Ensures every user has a subscription row. Creates FREE on first access.
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
  compUntil: Date | null;
};

/**
 * Resolves effective plan for limits: comp > paid PRO > active trial > FREE.
 * PRO_TRIAL branches remain for backward compat with existing trial users.
 */
export async function resolveEffectiveBillingState(
  userId: string,
): Promise<EffectiveBillingState> {
  const sub = await ensureSubscriptionRow(userId);
  const now = new Date();

  if (sub.compUntil && sub.compUntil > now) {
    return { planKey: "PRO", status: sub.status, compUntil: sub.compUntil };
  }

  if (
    sub.planKey === "PRO" &&
    (sub.status === "ACTIVE" || sub.status === "PAST_DUE")
  ) {
    return { planKey: "PRO", status: sub.status, compUntil: sub.compUntil };
  }

  if (sub.planKey === "PRO_TRIAL" && sub.trialEndsAt && sub.trialEndsAt > now) {
    return { planKey: "PRO_TRIAL", status: sub.status, compUntil: sub.compUntil };
  }

  if (sub.planKey === "PRO_TRIAL" && sub.trialEndsAt && sub.trialEndsAt <= now) {
    await prisma.subscription.update({
      where: { userId },
      data: { planKey: "FREE", status: "ACTIVE" },
    });
    return { planKey: "FREE", status: "ACTIVE", compUntil: sub.compUntil };
  }

  if (sub.planKey === "PRO") {
    await prisma.subscription.updateMany({
      where: { userId, planKey: "PRO" },
      data: {
        planKey: "FREE",
        status: "ACTIVE",
        stripeSubscriptionId: null,
        stripePriceId: null,
      },
    });
    return { planKey: "FREE", status: "ACTIVE", compUntil: sub.compUntil };
  }

  return { planKey: "FREE", status: "ACTIVE", compUntil: sub.compUntil };
}
