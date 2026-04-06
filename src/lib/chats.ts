import { auth } from "@/lib/auth";
import { getChatModel } from "@/lib/ai";
import prisma from "@/lib/prisma";
import type { MessageRole } from "@/generated/prisma/enums";
import { generateText } from "ai";
import { headers } from "next/headers";

async function generateChatTitle(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: getChatModel(),
    system:
      "Generate a short, specific chat title (max 6 words, no punctuation, no quotes) that captures the topic of the user's message. Reply with only the title.",
    prompt,
  });
  return text.trim().slice(0, 80);
}

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

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { title: true },
  });

  const isFirstUserMessage = role === "USER" && !chat?.title;

  if (isFirstUserMessage) {
    try {
      const newTitle = await generateChatTitle(content);
      await prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date(), title: newTitle },
      });
    } catch {
      await prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });
    }
  } else {
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });
  }

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
