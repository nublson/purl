import "server-only";

import { MAX_SAVED_LINKS } from "@/lib/limits";
import prisma from "@/lib/prisma";

export type UsageSummary = {
  saves: { used: number; cap: number };
};

export async function getUsageSummaryForUser(
  userId: string,
): Promise<UsageSummary> {
  const saveCount = await prisma.link.count({ where: { userId } });
  return { saves: { used: saveCount, cap: MAX_SAVED_LINKS } };
}
