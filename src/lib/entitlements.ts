import "server-only";

import { MAX_SAVED_LINKS } from "@/lib/limits";
import prisma from "@/lib/prisma";

export class SaveLimitError extends Error {
  readonly name = "SaveLimitError";
  /** Stable code returned to API/MCP clients alongside `LIMIT_REACHED`. */
  readonly feature = "SAVE_LIMIT";
}

export async function assertCanSaveLink(userId: string): Promise<void> {
  const n = await prisma.link.count({ where: { userId } });
  if (n >= MAX_SAVED_LINKS) {
    throw new SaveLimitError(
      `You've reached the ${MAX_SAVED_LINKS.toLocaleString("en-US")}-link limit. Delete links you no longer need to save new ones.`,
    );
  }
}
