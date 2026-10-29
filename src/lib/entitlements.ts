import "server-only";

import { MAX_SAVED_LINKS, MAX_UPLOAD_BYTES_PER_ACCOUNT } from "@/lib/limits";
import prisma, { type Prisma } from "@/lib/prisma";

/** A cap was reached; API/MCP answer `LIMIT_REACHED` with this error's `feature`. */
export abstract class LimitError extends Error {
  /** Stable code returned to API/MCP clients alongside `LIMIT_REACHED`. */
  abstract readonly feature: "SAVE_LIMIT" | "STORAGE_LIMIT";
}

export class SaveLimitError extends LimitError {
  readonly name = "SaveLimitError";
  readonly feature = "SAVE_LIMIT";
}

export class StorageLimitError extends LimitError {
  readonly name = "StorageLimitError";
  readonly feature = "STORAGE_LIMIT";
}

function limitError(): SaveLimitError {
  return new SaveLimitError(
    `You've reached the ${MAX_SAVED_LINKS.toLocaleString("en-US")}-link limit. Delete links you no longer need to save new ones.`,
  );
}

function storageLimitError(): StorageLimitError {
  const megabytes = MAX_UPLOAD_BYTES_PER_ACCOUNT / (1024 * 1024);
  return new StorageLimitError(
    `Your ${megabytes} MB of storage is full. Delete files you no longer need to upload more.`,
  );
}

/** Fast pre-check before slow work (metadata scraping); not race-safe on its own — pair with `insertWithinSaveLimit`. */
export async function assertCanSaveLink(userId: string): Promise<void> {
  const n = await prisma.link.count({ where: { userId } });
  if (n >= MAX_SAVED_LINKS) throw limitError();
}

/** The account's storage for uploaded files, in bytes: the same flat cap for everyone. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- one flat cap today; callers pass the user so a per-account cap needs no call-site changes.
export async function getStorageCapForUser(userId: string): Promise<number> {
  return MAX_UPLOAD_BYTES_PER_ACCOUNT;
}

/** Bytes the account's uploaded files take (the sum of `Link.fileSize`; links count as 0). */
export async function getStorageUsedForUser(
  userId: string,
  db: Pick<Prisma.TransactionClient, "link"> = prisma,
): Promise<number> {
  const { _sum } = await db.link.aggregate({
    where: { userId },
    _sum: { fileSize: true },
  });
  return _sum.fileSize ?? 0;
}

/** Fast pre-check before an upload; not race-safe on its own — pair with `insertWithinSaveLimit`'s `bytes`. */
export async function assertCanStore(userId: string, bytes: number): Promise<void> {
  const [used, cap] = await Promise.all([
    getStorageUsedForUser(userId),
    getStorageCapForUser(userId),
  ]);
  if (used + bytes > cap) throw storageLimitError();
}

/**
 * Runs `insert` only if the user is still under the cap, atomically: a
 * per-user advisory lock (released at commit/rollback) serializes concurrent
 * saves, so two requests at 999 links can't both insert. Keep `insert` short —
 * the lock is held for the whole transaction.
 *
 * `reuse`, when given, runs first under the same lock: if it returns a value,
 * that is the result and nothing is inserted or counted against the cap. It
 * lets a save that found no row before its (slow) metadata work check again
 * once it holds the lock, so two concurrent saves of one URL end as one row.
 *
 * `bytes`, when given (an upload's file size), is also checked against the
 * storage cap under the same lock, after the link count: `StorageLimitError`
 * when the account's files plus these bytes would exceed it.
 */
export async function insertWithinSaveLimit<T>(
  userId: string,
  insert: (tx: Prisma.TransactionClient) => Promise<T>,
  options: {
    reuse?: (tx: Prisma.TransactionClient) => Promise<T | null>;
    bytes?: number;
  } = {},
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Separate key space from the folder lock in folders.ts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`links:${userId}`}))`;
    const reused = options.reuse ? await options.reuse(tx) : null;
    if (reused !== null) return reused;
    const n = await tx.link.count({ where: { userId } });
    if (n >= MAX_SAVED_LINKS) throw limitError();
    if (options.bytes !== undefined) {
      const used = await getStorageUsedForUser(userId, tx);
      const cap = await getStorageCapForUser(userId);
      if (used + options.bytes > cap) throw storageLimitError();
    }
    return insert(tx);
  });
}
