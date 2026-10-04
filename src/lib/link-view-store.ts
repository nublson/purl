import "server-only";

import {
  DEFAULT_LAYOUT,
  linkViewFromDb,
  linkViewToDb,
  type LayoutPrefs,
} from "@/lib/link-view";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * The user's saved layout (view, folder tags), read fresh from the
 * database (the session's cookie cache can be minutes old, and another
 * device may have changed it). Deduplicated per request.
 */
export const getLayoutForUser = cache(
  async (userId: string): Promise<LayoutPrefs> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { linkView: true, showFolderTags: true },
    });
    if (!user) return DEFAULT_LAYOUT;
    return {
      view: linkViewFromDb(user.linkView),
      folderTags: user.showFolderTags,
    };
  },
);

/** Saves the given layout settings (the others stay as they are). */
export async function setLayoutForUser(
  userId: string,
  change: Partial<LayoutPrefs>,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(change.view ? { linkView: linkViewToDb(change.view) } : {}),
      ...(change.folderTags !== undefined
        ? { showFolderTags: change.folderTags }
        : {}),
    },
  });
}
