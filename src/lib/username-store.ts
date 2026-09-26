import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * True when `username` is already owned by a user other than `exceptUserId`.
 * `username` must already be normalized (see `validateUsername`).
 */
export async function isUsernameTaken(
  username: string,
  exceptUserId?: string,
): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!existing) return false;
  if (exceptUserId && existing.id === exceptUserId) return false;
  return true;
}

/**
 * Sets `userId`'s username. Relies on the DB's unique constraint as the
 * final word on collisions (a race can slip past an earlier
 * `isUsernameTaken` check), reporting those as `"taken"` instead of
 * throwing. Prisma reports a unique-constraint violation as error code
 * `P2002`; there's no existing `PrismaClientKnownRequestError` precedent
 * elsewhere in this codebase to match, so this checks the error's `code`
 * field structurally rather than importing the generated error class.
 */
export async function setUsername(
  userId: string,
  username: string,
): Promise<"ok" | "taken"> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { username },
    });
    return "ok";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return "taken";
    }
    throw error;
  }
}
