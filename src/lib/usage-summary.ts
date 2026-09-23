import "server-only";

import { getEntitlementContext } from "@/lib/entitlements";
import prisma from "@/lib/prisma";
import { countUsage } from "@/lib/usage";

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type UsageSummary = {
  effectivePlanKey: string;
  saves: { used: number; cap: number | null };
  extractions: { used: number; cap: number | null };
};

export async function getUsageSummaryForUser(
  userId: string,
): Promise<UsageSummary> {
  const { effectivePlanKey, entitlements, billing } =
    await getEntitlementContext(userId);

  const saveCap = entitlements.maxLifetimeSaves;
  const saveCount = await prisma.link.count({ where: { userId } });

  const extractCap = entitlements.maxExtractionsPerPeriod;
  const extractUsed =
    extractCap != null && extractCap > 0
      ? await countUsage(userId, "EXTRACT", {
          since: startOfUtcMonth(new Date()),
        })
      : 0;

  return {
    effectivePlanKey,
    saves: {
      used: saveCount,
      cap: saveCap,
    },
    extractions: {
      used: extractUsed,
      cap: extractCap,
    },
  };
}
