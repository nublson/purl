import "server-only";

import type { PlanKey } from "@/generated/prisma/enums";
import {
  entitlementsForPlanKey,
  type EffectiveEntitlements,
  type LimitFeatureCode,
} from "@/lib/plans";
import prisma from "@/lib/prisma";
import { resolveEffectiveBillingState } from "@/lib/subscription-utils";
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

export async function assertCanUploadFiles(userId: string): Promise<void> {
  const { entitlements } = await getEntitlementContext(userId);
  if (!entitlements.allowFileUploads) {
    throw new BillingLimitError(
      "UPLOAD_NOT_ALLOWED",
      "File uploads are a Pro feature. Upgrade to upload PDFs and audio.",
    );
  }
}
