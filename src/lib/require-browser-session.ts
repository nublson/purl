import "server-only";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * Resolves the authenticated user id from a real browser session cookie only.
 *
 * Better Auth's apiKey plugin (`enableSessionForAPIKeys: true` in
 * src/lib/auth.ts) makes `auth.api.getSession` resolve a valid session from
 * an `Authorization: Bearer purl_…` header alone, no cookie required — that's
 * intentional for /api/v1 and /api/mcp, but Settings-UI-only routes (BYOK key,
 * preferences, avatar, connected-apps) must not be reachable with just a
 * leaked API key. Reject any request carrying an Authorization header before
 * ever calling getSession, since the browser's own fetch calls to these
 * routes never send one — its mere presence means this isn't a real browser
 * session request.
 */
export async function getBrowserSessionUserId(): Promise<string | null> {
  const requestHeaders = await headers();
  if (requestHeaders.get("authorization")) return null;

  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user?.id ?? null;
}
