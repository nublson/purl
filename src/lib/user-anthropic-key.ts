import "server-only";

import { decrypt, encrypt } from "@/lib/crypto";
import prisma from "@/lib/prisma";

export async function getByokKey(
  userId: string,
): Promise<{ hasKey: boolean; encryptedKey: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { anthropicApiKeyEncrypted: true },
  });
  const encryptedKey = user?.anthropicApiKeyEncrypted ?? null;
  return { hasKey: Boolean(encryptedKey), encryptedKey };
}

export async function getDecryptedByokKey(userId: string): Promise<string | null> {
  const { encryptedKey } = await getByokKey(userId);
  if (!encryptedKey) return null;
  return decrypt(encryptedKey);
}

export async function saveByokKey(userId: string, plainKey: string): Promise<void> {
  if (!isValidAnthropicKey(plainKey)) {
    throw new Error("Key must start with sk-ant- and be at least 20 characters");
  }
  const encrypted = encrypt(plainKey);
  await prisma.user.update({
    where: { id: userId },
    data: { anthropicApiKeyEncrypted: encrypted },
  });
}

export async function deleteByokKey(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { anthropicApiKeyEncrypted: null },
  });
}

export function maskByokKey(plainKey: string): string {
  if (plainKey.length <= 12) return "sk-ant-***";
  return `${plainKey.slice(0, 10)}...${plainKey.slice(-4)}`;
}

function isValidAnthropicKey(key: string): boolean {
  return /^sk-ant-/.test(key) && key.length >= 20;
}
