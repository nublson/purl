import "server-only";

import type { SubStatus } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import { stripePriceIdToPlanKey } from "@/lib/plans";
import type Stripe from "stripe";

function mapStripeSubscriptionStatus(
  s: Stripe.Subscription.Status,
): SubStatus {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
      return "CANCELED";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    case "trialing":
      return "TRIALING";
    case "paused":
      return "ACTIVE";
    default:
      return "INCOMPLETE";
  }
}

function primaryPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  return item?.price?.id ?? null;
}

export async function applyStripeSubscriptionToUser(
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const stripeStatus = sub.status;

  const item = sub.items.data[0];
  const periodStart = item?.current_period_start ?? null;
  const periodEnd = item?.current_period_end ?? null;

  if (stripeStatus === "canceled") {
    await prisma.subscription.update({
      where: { userId },
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
    return;
  }

  const priceId = primaryPriceId(sub);
  const mappedPlan = priceId ? stripePriceIdToPlanKey(priceId) : null;
  if (!mappedPlan) {
    console.error("Unknown Stripe price on subscription", priceId, sub.id);
    return;
  }

  const status = mapStripeSubscriptionStatus(stripeStatus);
  await prisma.subscription.update({
    where: { userId },
    data: {
      planKey: mappedPlan,
      status,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      currentPeriodStart: periodStart
        ? new Date(periodStart * 1000)
        : null,
      currentPeriodEnd: periodEnd
        ? new Date(periodEnd * 1000)
        : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

export async function linkStripeCustomerFromCheckout(
  userId: string,
  stripeCustomerId: string,
  subscriptionId: string | undefined,
): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: {
      stripeCustomerId,
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    },
  });
}
