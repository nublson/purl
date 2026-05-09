import { auth } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/billing-url";
import { getStripePriceIdForBillingInterval } from "@/lib/plans";
import prisma from "@/lib/prisma";
import { ensureSubscriptionRow } from "@/lib/subscription-utils";
import { getStripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  if (!userId || !userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let interval: "month" | "year" = "month";
  try {
    const body = (await request.json()) as { interval?: string };
    if (body.interval === "year" || body.interval === "month") {
      interval = body.interval;
    }
  } catch {
    // default month
  }

  const priceId = getStripePriceIdForBillingInterval(interval);
  const subRow = await ensureSubscriptionRow(userId);

  let customerId = subRow.stripeCustomerId;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.subscription.update({
      where: { userId },
      data: { stripeCustomerId: customerId },
    });
  }

  const base = getAppBaseUrl();
  const checkoutSession = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/home?checkout=success`,
    cancel_url: `${base}/home?checkout=canceled`,
    subscription_data: {
      metadata: { userId },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  if (!checkoutSession.url) {
    return NextResponse.json(
      { error: "Checkout session missing URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: checkoutSession.url });
}
