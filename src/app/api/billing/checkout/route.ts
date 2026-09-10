import { getAppBaseUrl } from "@/lib/billing-url";
import { getStripeOneTimePriceId } from "@/lib/plans";
import prisma from "@/lib/prisma";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { ensureSubscriptionRow } from "@/lib/subscription-utils";
import { getStripe } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // consume body even though we don't use interval anymore
  try { await request.json(); } catch { /* no body is fine */ }

  const priceId = getStripeOneTimePriceId();
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
    mode: "payment",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/home?checkout=success`,
    cancel_url: `${base}/home?checkout=canceled`,
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
