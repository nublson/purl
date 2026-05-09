import { auth } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/billing-url";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
  });
  const customerId = sub?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account yet. Subscribe first." },
      { status: 400 },
    );
  }

  const base = getAppBaseUrl();
  const portal = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/home`,
  });

  return NextResponse.json({ url: portal.url });
}
