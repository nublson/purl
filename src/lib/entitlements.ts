import "server-only";

import type { PlanKey } from "@/generated/prisma/enums";
import {
  entitlementsForPlanKey,
  type EffectiveEntitlements,
  type LimitFeatureCode,
} from "@/lib/plans";
import prisma from "@/lib/prisma";
import { resolveEffectiveBillingState } from "@/lib/subscription-utils";
import { countUsage } from "@/lib/usage";
import { cache } from "react";

export class BillingLimitError extends Error {
  readonly name = "BillingLimitError";
  constructor(
    public readonly feature: LimitFeatureCode,
    message: string,
    public readonly detail?: { resetAt?: string },
  ) {
    super(message);
  }
}

export type EntitlementContext = {
  billing: Awaited<ReturnType<typeof resolveEffectiveBillingState>>;
  entitlements: EffectiveEntitlements;
  effectivePlanKey: PlanKey;
};

export const getEntitlementContext = cache(
  async (userId: string): Promise<EntitlementContext> => {
    const billing = await resolveEffectiveBillingState(userId);
    const effectivePlanKey = billing.planKey;
    const entitlements = entitlementsForPlanKey(effectivePlanKey);
    return { billing, entitlements, effectivePlanKey };
  },
);

export async function assertCanSaveLink(userId: string): Promise<void> {
  const { entitlements } = await getEntitlementContext(userId);
  const max = entitlements.maxLifetimeSaves;
  if (max == null) return;
  const n = await prisma.link.count({ where: { userId } });
  if (n >= max) {
    throw new BillingLimitError(
      "SAVE_LIMIT",
      `You've reached the ${max} link limit on the free plan.`,
    );
  }
}

export async function shouldRunIngest(
  userId: string,
): Promise<{ run: boolean; skipReason?: string }> {
  const { entitlements } = await getEntitlementContext(userId);
  if (!entitlements.aiFullAccess) {
    return { run: false, skipReason: "free_metadata_only" };
  }
  const cap = entitlements.maxExtractionsPerPeriod;
  if (cap == null) return { run: true };
  const used = await countUsage(userId, "EXTRACT", {
    since: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)),
  });
  if (used >= cap) {
    return { run: false, skipReason: "extraction_cap" };
  }
  return { run: true };
}

export async function assertCanChat(userId: string): Promise<void> {
  const { entitlements } = await getEntitlementContext(userId);
  const cap = entitlements.maxChatMessagesPerPeriod;
  if (cap == null) return;
  if (cap === 0) {
    throw new BillingLimitError(
      "CHAT_LIMIT",
      "AI chat is a Pro feature. Upgrade to Pro for unlimited chat.",
    );
  }
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (entitlements.chatPeriodDays ?? 30));
  const used = await countUsage(userId, "CHAT_MSG", { since });
  if (used >= cap) {
    throw new BillingLimitError(
      "CHAT_LIMIT",
      `You've used your ${cap} free AI messages. Upgrade to Pro for unlimited chat.`,
    );
  }
}

export async function assertCanUploadFiles(userId: string): Promise<void> {
  const { entitlements } = await getEntitlementContext(userId);
  if (!entitlements.allowFileUploads) {
    throw new BillingLimitError(
      "UPLOAD_NOT_ALLOWED",
      "File uploads are a Pro feature. Upgrade to upload PDFs and audio.",
    );
  }
}
