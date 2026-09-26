import "server-only";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cache } from "react";

/** Fields of the signed-in user that client components need. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string;
};

/**
 * The signed-in user for the current request, or null. Deduplicated per
 * request (layout, page, and data helpers share one session lookup).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id) return null;
  // `username` is `required: false` in auth.ts (see the comment there) so
  // Better Auth's inferred type allows it to be missing, but the Prisma
  // column is NOT NULL and `databaseHooks.user.create.before` always
  // assigns one before a row is created — so an authenticated user with no
  // username indicates a bug (e.g. a row created outside that hook), not a
  // normal state to paper over with a placeholder. Fail loudly instead.
  if (!user.username) {
    throw new Error(
      `User ${user.id} has no username; databaseHooks.user.create.before should always assign one on creation.`,
    );
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    username: user.username,
  };
});
