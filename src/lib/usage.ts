import "server-only";

import type { UsageKind } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";

export async function recordUsage(
  userId: string,
  kind: UsageKind,
  meta?: Record<string, unknown>,
): Promise<void> {
  await prisma.usageEvent.create({
    data: {
      userId,
      kind,
      meta: meta ? (meta as object) : undefined,
    },
  });
}

export async function countUsage(
  userId: string,
  kind: UsageKind,
  opts: { since: Date; until?: Date },
): Promise<number> {
  return prisma.usageEvent.count({
    where: {
      userId,
      kind,
      createdAt: {
        gte: opts.since,
        ...(opts.until ? { lt: opts.until } : {}),
      },
    },
  });
}
