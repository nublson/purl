import "server-only";

import prisma from "@/lib/prisma";

export type ConnectedApp = {
  clientId: string;
  name: string;
  createdAt: string;
};

/** Lists the OAuth clients a user has actively consented to, newest first. */
export async function listConnectedApps(
  userId: string,
): Promise<ConnectedApp[]> {
  const consents = await prisma.oauthConsent.findMany({
    where: { userId, consentGiven: true },
    orderBy: { createdAt: "desc" },
  });
  if (consents.length === 0) return [];

  const apps = await prisma.oauthApplication.findMany({
    where: { clientId: { in: consents.map((c) => c.clientId) } },
  });
  const nameByClientId = new Map(apps.map((a) => [a.clientId, a.name]));

  return consents.map((consent) => ({
    clientId: consent.clientId,
    name: nameByClientId.get(consent.clientId) ?? "Unknown app",
    createdAt: consent.createdAt.toISOString(),
  }));
}

/**
 * Revokes a connected app: deletes its access/refresh tokens (so it stops
 * working immediately) and its consent record (so it must re-prompt on
 * reconnect), both scoped to the given user.
 */
export async function revokeConnectedApp(
  userId: string,
  clientId: string,
): Promise<boolean> {
  await prisma.oauthAccessToken.deleteMany({ where: { userId, clientId } });
  const { count } = await prisma.oauthConsent.deleteMany({
    where: { userId, clientId },
  });
  return count > 0;
}
