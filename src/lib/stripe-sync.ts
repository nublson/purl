import "server-only";

import prisma from "@/lib/prisma";

export async function applyOneTimePaymentToUser(
  userId: string,
  stripeCustomerId: string,
  priceId: string,
): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: {
      planKey: "PRO",
      status: "ACTIVE",
      stripeCustomerId,
      stripePriceId: priceId,
    },
  });
}
