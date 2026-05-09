import {
  applyStripeSubscriptionToUser,
  linkStripeCustomerFromCheckout,
} from "@/lib/stripe-sync";
import {
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
} from "@/lib/billing-emails";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

function getInvoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const raw = inv.parent?.subscription_details?.subscription;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string") {
    return raw.id;
  }
  return null;
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!userId || !customerId) break;
        await linkStripeCustomerFromCheckout(
          userId,
          customerId,
          subscriptionId,
        );
        if (subscriptionId) {
          const sub = await getStripe().subscriptions.retrieve(subscriptionId);
          await applyStripeSubscriptionToUser(userId, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await applyStripeSubscriptionToUser(userId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;
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
        const row = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (row?.email) await sendSubscriptionCanceledEmail(row.email);
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(inv);
        if (!subId) break;
        const sub = await getStripe().subscriptions.retrieve(subId);
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await prisma.subscription.update({
          where: { userId },
          data: { status: "ACTIVE" },
        });
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = getInvoiceSubscriptionId(inv);
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          const uid = sub.metadata?.userId;
          if (uid) {
            await prisma.subscription.update({
              where: { userId: uid },
              data: { status: "PAST_DUE" },
            });
          }
        }
        let email = inv.customer_email ?? undefined;
        if (!email && typeof inv.customer === "string") {
          const cust = await getStripe().customers.retrieve(inv.customer);
          if (
            cust &&
            !("deleted" in cust && cust.deleted) &&
            "email" in cust
          ) {
            email = cust.email ?? undefined;
          }
        }
        if (email) {
          await sendPaymentFailedEmail(
            email,
            "If you are logged in, open Settings to manage billing.",
          );
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { stripeEventType: event.type, stripeEventId: event.id },
    });
    throw e;
  }
}

export async function isStripeEventProcessed(eventId: string): Promise<boolean> {
  const row = await prisma.processedStripeEvent.findUnique({
    where: { id: eventId },
  });
  return Boolean(row);
}

export async function recordStripeEventProcessed(
  eventId: string,
  eventType: string,
): Promise<void> {
  await prisma.processedStripeEvent.create({
    data: { id: eventId, type: eventType },
  });
}
