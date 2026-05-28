import "server-only";

import "server-only";

import { getEntitlementContext } from "@/lib/entitlements";
import prisma from "@/lib/prisma";
import { countUsage } from "@/lib/usage";

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type UsageSummary = {
  effectivePlanKey: string;
  trialEndsAt: Date | null;
  saves: { used: number; cap: number | null };
  chatMessages: { used: number; cap: number | null; windowDays: number | null };
  extractions: { used: number; cap: number | null };
};

export async function getUsageSummaryForUser(
  userId: string,
): Promise<UsageSummary> {
  const { effectivePlanKey, entitlements, billing } =
    await getEntitlementContext(userId);

  const saveCap = entitlements.maxLifetimeSaves;
  const saveCount = await prisma.link.count({ where: { userId } });

  const chatCap = entitlements.maxChatMessagesPerPeriod;
  const chatUsed =
    chatCap != null && chatCap > 0
      ? await countUsage(userId, "CHAT_MSG", {
          since: startOfUtcMonth(new Date()),
        })
      : 0;

  const extractCap = entitlements.maxExtractionsPerPeriod;
  const extractUsed =
    extractCap != null && extractCap > 0
      ? await countUsage(userId, "EXTRACT", {
          since: startOfUtcMonth(new Date()),
        })
      : 0;

  return {
    effectivePlanKey,
    trialEndsAt: billing.trialEndsAt,
    saves: {
      used: saveCount,
      cap: saveCap,
    },
    chatMessages: {
      used: chatUsed,
      cap: chatCap,
      windowDays: entitlements.chatPeriodDays,
    },
    extractions: {
      used: extractUsed,
      cap: extractCap,
    },
  };
}
