import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { MessageRole } from "@/generated/prisma/enums";
import { headers } from "next/headers";

export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError";
}

async function getCurrentUserId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

export async function getChatsForCurrentUser() {
  const userId = await getCurrentUserId();

  return prisma.chat.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });
}

export async function getChatWithMessages(chatId: string) {
  const userId = await getCurrentUserId();

  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          mentions: {
            select: {
              id: true,
              url: true,
              title: true,
              favicon: true,
              domain: true,
              contentType: true,
            },
          },
        },
      },
    },
  });

  return chat;
}

export async function createChat(title?: string) {
  const userId = await getCurrentUserId();

  return prisma.chat.create({
    data: {
      title: title ?? null,
      userId,
    },
  });
}

export async function deleteChat(chatId: string): Promise<boolean> {
  const userId = await getCurrentUserId();

  const existing = await prisma.chat.findFirst({
    where: { id: chatId, userId },
  });
  if (!existing) return false;

  await prisma.chat.delete({ where: { id: chatId } });
  return true;
}

export async function saveMessage(
  chatId: string,
  role: MessageRole,
  content: string,
  mentionedLinkIds?: string[],
) {
  const message = await prisma.chatMessage.create({
    data: {
      chatId,
      role,
      content,
      mentions:
        mentionedLinkIds && mentionedLinkIds.length > 0
          ? { connect: mentionedLinkIds.map((id) => ({ id })) }
          : undefined,
    },
  });

  await prisma.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });

  return message;
}

export async function verifyChatOwnership(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
    select: { id: true },
  });
  return chat !== null;
}
