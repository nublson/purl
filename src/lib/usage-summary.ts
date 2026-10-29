import "server-only";

import { getStorageCapForUser, getStorageUsedForUser } from "@/lib/entitlements";
import { MAX_SAVED_LINKS } from "@/lib/limits";
import prisma from "@/lib/prisma";

export type UsageSummary = {
  saves: { used: number; cap: number };
  storage: { used: number; cap: number };
};

export async function getUsageSummaryForUser(
  userId: string,
): Promise<UsageSummary> {
  const [saveCount, storageUsed, storageCap] = await Promise.all([
    prisma.link.count({ where: { userId } }),
    getStorageUsedForUser(userId),
    getStorageCapForUser(userId),
  ]);
  return {
    saves: { used: saveCount, cap: MAX_SAVED_LINKS },
    storage: { used: storageUsed, cap: storageCap },
  };
}
