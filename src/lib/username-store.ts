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
 * Sets `userId`'s username, keeping the old one as a redirect for shared
 * `/@username/...` URLs. Relies on the DB's unique constraint as the
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
    await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { username },
      });
      // The new name is live now: any redirect from it (yours or someone
      // else's old name) is moot.
      await tx.usernameRedirect.deleteMany({ where: { username } });
      // The old name keeps shared /@old-name/... links working until
      // someone else takes it (a live username always wins).
      if (current && current.username !== username) {
        await tx.usernameRedirect.upsert({
          where: { username: current.username },
          create: { username: current.username, userId },
          update: { userId },
        });
      }
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
