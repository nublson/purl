import prisma from "@/lib/prisma";

export type UserPreferences = {
  defaultPage?: "home" | "ai";
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultPage: "home",
};

export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFERENCES;
  const p = raw as Record<string, unknown>;
  return {
    defaultPage: p.defaultPage === "ai" ? "ai" : "home",
  };
}

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
