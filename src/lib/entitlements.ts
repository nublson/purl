import "server-only";

import { MAX_SAVED_LINKS } from "@/lib/limits";
import prisma, { type Prisma } from "@/lib/prisma";

export class SaveLimitError extends Error {
  readonly name = "SaveLimitError";
  /** Stable code returned to API/MCP clients alongside `LIMIT_REACHED`. */
  readonly feature = "SAVE_LIMIT";
}

function limitError(): SaveLimitError {
  return new SaveLimitError(
    `You've reached the ${MAX_SAVED_LINKS.toLocaleString("en-US")}-link limit. Delete links you no longer need to save new ones.`,
  );
}

/** Fast pre-check before slow work (metadata scraping); not race-safe on its own — pair with `insertWithinSaveLimit`. */
export async function assertCanSaveLink(userId: string): Promise<void> {
  const n = await prisma.link.count({ where: { userId } });
  if (n >= MAX_SAVED_LINKS) throw limitError();
}

/**
 * Runs `insert` only if the user is still under the cap, atomically: a
 * per-user advisory lock (released at commit/rollback) serializes concurrent
 * saves, so two requests at 999 links can't both insert. Keep `insert` short —
 * the lock is held for the whole transaction.
 */
export async function insertWithinSaveLimit<T>(
  userId: string,
  insert: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Separate key space from the folder lock in folders.ts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`links:${userId}`}))`;
    const n = await tx.link.count({ where: { userId } });
    if (n >= MAX_SAVED_LINKS) throw limitError();
    return insert(tx);
  });
}
