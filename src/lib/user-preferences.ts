import "server-only";

import prisma from "@/lib/prisma";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  type UserPreferences,
} from "@/lib/user-preferences-shared";

export {
  DEFAULT_PREFERENCES,
  parsePreferences,
  type UserPreferences,
} from "@/lib/user-preferences-shared";

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return parsePreferences(user?.preferences);
}

export async function updatePreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  const merged = { ...current, ...patch };
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: merged },
  });
  return merged;
}
