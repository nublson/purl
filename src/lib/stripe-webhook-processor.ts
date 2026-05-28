import { applyOneTimePaymentToUser } from "@/lib/stripe-sync";
import { getStripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

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
        if (!userId || !customerId) break;

        // Expand line_items to retrieve the price ID from the completed session
        const full = await getStripe().checkout.sessions.retrieve(session.id, {
          expand: ["line_items"],
        });
        const priceId = full.line_items?.data[0]?.price?.id ?? "";

        await applyOneTimePaymentToUser(userId, customerId, priceId);
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
