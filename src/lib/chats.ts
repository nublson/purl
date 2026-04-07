import { auth } from "@/lib/auth";
import { getChatModel } from "@/lib/ai";
import prisma from "@/lib/prisma";
import type { MessageRole } from "@/generated/prisma/enums";
import { generateText } from "ai";
import { headers } from "next/headers";

async function generateChatTitle(input: {
  userMessage?: string | null;
  assistantReply?: string | null;
}): Promise<string> {
  const blocks: string[] = [];
  if (input.userMessage?.trim()) {
    blocks.push(
      "What the user asked (primary source for the title):",
      input.userMessage.trim().slice(0, 2000),
    );
  }
  if (input.assistantReply?.trim()) {
    blocks.push(
      "What the assistant replied (context only — do not title based on cited sources or link names):",
      input.assistantReply.trim().slice(0, 4000),
    );
  }
  const prompt = blocks.join("\n\n").trim() || "Untitled conversation";

  const { text } = await generateText({
    model: getChatModel(),
    system: `You name a personal chat thread the way a human would label it in a notes app or message list: concrete and specific, never bureaucratic.

Rules:
- Maximum 6 words. No quotation marks. No trailing punctuation.
- Base the title on what the USER asked or intended — not on the titles of links, articles, or sources mentioned in the assistant's reply.
- Derive a concrete label from the intent: if the user asked about reading habits, say "April Reading Habits"; if they asked about a specific topic, name that topic.
- Forbidden as the main idea: request, question, summary, overview, help, explain, chat, discussion, analysis, guide, tips, and similar meta labels.
- Do not copy article or link titles verbatim from the assistant's reply.

Reply with only the title, nothing else.`,
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

  let newTitle: string | null = null;
  if (
    role === "ASSISTANT" &&
    !chat?.title &&
    content.trim().length > 0
  ) {
    try {
      const lastUser = await prisma.chatMessage.findFirst({
        where: { chatId, role: "USER" },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      const raw = await generateChatTitle({
        userMessage: lastUser?.content ?? null,
        assistantReply: content,
      });
      const trimmed = raw.trim().slice(0, 80);
      if (trimmed) newTitle = trimmed;
    } catch {
      /* keep title unset */
    }
  }

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      updatedAt: new Date(),
      ...(newTitle ? { title: newTitle } : {}),
    },
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
