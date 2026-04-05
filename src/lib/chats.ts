import "server-only";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { UIMessage } from "ai";
import { headers } from "next/headers";

export class UnauthorizedChatError extends Error {
  readonly name = "UnauthorizedChatError";
}

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) throw new UnauthorizedChatError();
  return session.user.id;
}

export async function listChatsForCurrentUser() {
  const userId = await requireUserId();
  return prisma.chat.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true, createdAt: true },
  });
}

export async function createChatForCurrentUser() {
  const userId = await requireUserId();
  return prisma.chat.create({
    data: { userId },
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function deleteChatForCurrentUser(chatId: string): Promise<boolean> {
  const userId = await requireUserId();
  const existing = await prisma.chat.findFirst({
    where: { id: chatId, userId },
  });
  if (!existing) return false;
  await prisma.chat.delete({ where: { id: chatId } });
  return true;
}

export async function assertChatOwnedByUser(
  chatId: string,
  userId: string,
): Promise<void> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
  });
  if (!chat) {
    const err = new Error("Chat not found");
    err.name = "ChatNotFoundError";
    throw err;
  }
}

export async function getChatMessagesAsUIMessages(
  chatId: string,
  userId: string,
): Promise<UIMessage[]> {
  await assertChatOwnedByUser(chatId, userId);
  const rows = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export async function upsertUserChatMessage(params: {
  chatId: string;
  userId: string;
  uiMessageId: string;
  content: string;
}): Promise<void> {
  await assertChatOwnedByUser(params.chatId, params.userId);
  await prisma.chatMessage.upsert({
    where: {
      chatId_uiMessageId: {
        chatId: params.chatId,
        uiMessageId: params.uiMessageId,
      },
    },
    create: {
      chatId: params.chatId,
      role: "user",
      content: params.content,
      uiMessageId: params.uiMessageId,
    },
    update: {},
  });
  await prisma.chat.update({
    where: { id: params.chatId },
    data: { updatedAt: new Date() },
  });
}

export async function appendAssistantChatMessage(params: {
  chatId: string;
  userId: string;
  text: string;
}): Promise<void> {
  await assertChatOwnedByUser(params.chatId, params.userId);
  if (!params.text.trim()) return;
  await prisma.chatMessage.create({
    data: {
      chatId: params.chatId,
      role: "assistant",
      content: params.text,
    },
  });
  await prisma.chat.update({
    where: { id: params.chatId },
    data: { updatedAt: new Date() },
  });
}

export async function setChatTitleIfEmpty(
  chatId: string,
  userId: string,
  fromText: string,
): Promise<void> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
  });
  if (!chat || chat.title) return;
  const t = fromText.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return;
  await prisma.chat.update({
    where: { id: chatId },
    data: { title: t },
  });
}
