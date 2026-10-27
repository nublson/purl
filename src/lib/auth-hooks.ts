import "server-only";

import { revokeConnectedApp } from "@/lib/connected-apps";
import { SAVE_ONLY_CLIENT_IDS } from "@/lib/oauth-route";
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
 * Better Auth `hooks.before` handler for `/sign-out`: revokes the save-only
 * clients' connections (the nublson.com portfolio and the browser extension:
 * their tokens and consent) for the user signing out, so their next save gets
 * a 401 and runs the connect flow, which asks them to sign in again. Only
 * those clients: other connected apps (Claude and other MCP clients) stay
 * connected. It runs before the sign-out so the session is still readable,
 * and never blocks the sign-out itself.
 */
export async function revokeSaveOnlyAppsOnSignOut(
  ctx: Parameters<typeof getSessionFromCtx>[0],
): Promise<void> {
  let userId: string;
  try {
    const session = await getSessionFromCtx(ctx);
    if (!session) return;
    userId = session.user.id;
  } catch (err) {
    console.error("sign-out: reading the session failed:", err);
    return;
  }
  // One failure doesn't keep the other clients connected.
  await Promise.all(
    [...SAVE_ONLY_CLIENT_IDS].map((clientId) =>
      revokeConnectedApp(userId, clientId).catch((err: unknown) => {
        console.error(`sign-out: revoking ${clientId} failed:`, err);
      }),
    ),
  );
}

/**
 * Better Auth `user.deleteUser.afterDelete` handler: removes every file the
 * user uploaded (their `users/<id>/` prefix in Blob) once the account row and
 * its cascaded links are gone, so a failed deletion never loses files. Best
 * effort and never throws: the account is already deleted, and an error here
 * would only turn that success into a failed response. Imported on demand to
 * keep Blob and the links module out of the auth instance's startup.
 */
export async function deleteUserBlobsAfterDelete(user: { id: string }): Promise<void> {
  try {
    const { deleteUserBlobs } = await import("@/lib/uploads");
    await deleteUserBlobs(user.id);
  } catch (error) {
    console.error("delete-user: deleting the user's files failed:", error);
  }
}
