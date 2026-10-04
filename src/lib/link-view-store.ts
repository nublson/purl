import "server-only";

import { linkViewFromDb, linkViewToDb, type LinkView } from "@/lib/link-view";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * The user's saved view, read fresh from the database (the session's
 * cookie cache can be minutes old, and another device may have changed
 * it). Deduplicated per request.
 */
export const getLinkViewForUser = cache(
  async (userId: string): Promise<LinkView> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { linkView: true },
    });
    return user ? linkViewFromDb(user.linkView) : "list";
  },
);

export async function setLinkViewForUser(
  userId: string,
  view: LinkView,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { linkView: linkViewToDb(view) },
  });
}
