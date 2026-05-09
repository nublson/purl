import "server-only";

import "server-only";

import { getEntitlementContext } from "@/lib/entitlements";
import {
  FREE_CHAT_PERIOD_DAYS,
} from "@/lib/plans";
import prisma from "@/lib/prisma";
import { countUsage } from "@/lib/usage";

function chatWindowSince(): Date {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - FREE_CHAT_PERIOD_DAYS);
  return since;
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type UsageSummary = {
  effectivePlanKey: string;
  trialEndsAt: string | null;
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
  const chatUsed = chatCap
    ? await countUsage(userId, "CHAT_MSG", { since: chatWindowSince() })
    : 0;

  let extractionSince: Date;
  let extractionUntil: Date | undefined;
  if (
    billing.currentPeriodStart &&
    billing.currentPeriodEnd &&
    effectivePlanKey === "PRO"
  ) {
    extractionSince = billing.currentPeriodStart;
    extractionUntil = billing.currentPeriodEnd;
  } else {
    extractionSince = startOfUtcMonth(new Date());
    extractionUntil = undefined;
  }
  const extractCap = entitlements.maxExtractionsPerPeriod;
  const extractUsed =
    extractCap != null && extractCap > 0
      ? await countUsage(userId, "EXTRACT", {
          since: extractionSince,
          until: extractionUntil,
        })
      : 0;

  return {
    effectivePlanKey,
    trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
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
