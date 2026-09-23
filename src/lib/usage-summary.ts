import "server-only";

import { getEntitlementContext } from "@/lib/entitlements";
import prisma from "@/lib/prisma";

export type UsageSummary = {
  effectivePlanKey: string;
  saves: { used: number; cap: number | null };
};

export async function getUsageSummaryForUser(
  userId: string,
): Promise<UsageSummary> {
  const { effectivePlanKey, entitlements } =
    await getEntitlementContext(userId);

  const saveCount = await prisma.link.count({ where: { userId } });

  return {
    effectivePlanKey,
    saves: {
      used: saveCount,
      cap: entitlements.maxLifetimeSaves,
    },
  };
}
