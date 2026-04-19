"use server";

import { auth } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function saveApiKey(rawKey: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (!rawKey.startsWith("sk-"))
    throw new Error("Invalid OpenAI API key format");

  const encryptedKey = encrypt(rawKey);

  await prisma.userAPIKey.upsert({
    where: { userId_provider: { userId: session.user.id, provider: "openai" } },
    update: { encryptedKey, updatedAt: new Date() },
    create: { userId: session.user.id, provider: "openai", encryptedKey },
  });

  return { success: true };
}

export async function getApiKeyStatus() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const record = await prisma.userAPIKey.findUnique({
    where: { userId_provider: { userId: session.user.id, provider: "openai" } },
  });

  return { hasKey: !!record };
}

export async function deleteApiKey() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userAPIKey.deleteMany({
    where: { userId: session.user.id, provider: "openai" },
  });

  return { success: true };
}

export async function getDecryptedApiKey(userId: string): Promise<string> {
  const record = await prisma.userAPIKey.findUnique({
    where: { userId_provider: { userId, provider: "openai" } },
  });

  if (!record) throw new Error("No API key found for this user");

  return decrypt(record.encryptedKey);
}
