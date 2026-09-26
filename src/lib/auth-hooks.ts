import "server-only";

import prisma from "@/lib/prisma";
import { generateUsername } from "@/lib/usernames";

/**
 * Better Auth `databaseHooks.user.create.before` handler: generates a
 * username for a newly-created user (from Google/GitHub/Apple sign-up) and
 * returns it merged into the user data.
 *
 * The `username` field is `input: false` in `user.additionalFields` (see
 * `auth.ts`), so Better Auth's own profile mapping never sets it — this hook
 * is the only place a username is assigned on account creation. Changing an
 * existing user's username later goes through `PATCH /api/user/username`.
 */
export async function assignUsernameOnCreate<
  U extends { email: string; name?: string | null },
>(user: U): Promise<{ data: U & { username: string } }> {
  const username = await generateUsername(user.email, user.name ?? null, async (candidate) => {
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    return existing !== null;
  });
  return { data: { ...user, username } };
}
