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
};

/**
 * The signed-in user for the current request, or null. Deduplicated per
 * request (layout, page, and data helpers share one session lookup).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
});
