import "server-only";

import { revokeConnectedApp } from "@/lib/connected-apps";
import { PORTFOLIO_CLIENT_ID } from "@/lib/oauth-route";
import prisma from "@/lib/prisma";
import { generateUsername } from "@/lib/usernames";
import { getSessionFromCtx } from "better-auth/api";

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

/**
 * Better Auth `hooks.before` handler for `/sign-out`: revokes the nublson.com
 * portfolio's connection (its tokens and consent) for the user signing out,
 * so the portfolio's next save gets a 401 and runs the connect flow, which
 * asks them to sign in again. Only that client: other connected apps (Claude
 * and other MCP clients) stay connected. It runs before the sign-out so the
 * session is still readable, and never blocks the sign-out itself.
 */
export async function revokePortfolioOnSignOut(
  ctx: Parameters<typeof getSessionFromCtx>[0],
): Promise<void> {
  try {
    const session = await getSessionFromCtx(ctx);
    if (!session) return;
    await revokeConnectedApp(session.user.id, PORTFOLIO_CLIENT_ID);
  } catch (err) {
    console.error("sign-out: revoking the portfolio connection failed:", err);
  }
}
