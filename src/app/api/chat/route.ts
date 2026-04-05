import { auth } from "@/lib/auth";
import { streamChatForUser } from "@/lib/chat";
import {
  appendAssistantChatMessage,
  assertChatOwnedByUser,
  setChatTitleIfEmpty,
  upsertUserChatMessage,
} from "@/lib/chats";
import { extractMentionLinkIds, getTextFromUIMessage } from "@/lib/chat-utils";
import { headers } from "next/headers";
import { convertToModelMessages, type UIMessage } from "ai";

export const maxDuration = 120;

type ChatRequestBody = {
  messages?: unknown[];
  mentionedLinkIds?: string[];
  chatId?: string;
};

function isUIMessageArray(value: unknown): value is UIMessage[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (m) =>
      m !== null &&
      typeof m === "object" &&
      "role" in m &&
      "parts" in m &&
      Array.isArray((m as UIMessage).parts),
  );
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isUIMessageArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body.chatId !== "string" || !body.chatId.trim()) {
    return new Response(JSON.stringify({ error: "chatId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const chatId = body.chatId.trim();
  const userId = session.user.id;

  try {
    await assertChatOwnedByUser(chatId, userId);
  } catch (e) {
    if (e instanceof Error && e.name === "ChatNotFoundError") {
      return new Response(JSON.stringify({ error: "Chat not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }

  const uiMessages = body.messages;
  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  if (!lastUser || lastUser.role !== "user") {
    return new Response(JSON.stringify({ error: "Last message must be user" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const lastUserText = getTextFromUIMessage(lastUser);
  await upsertUserChatMessage({
    chatId,
    userId,
    uiMessageId: lastUser.id,
    content: lastUserText,
  });
  await setChatTitleIfEmpty(chatId, userId, lastUserText);

  const fromBody = Array.isArray(body.mentionedLinkIds)
    ? body.mentionedLinkIds.filter((id): id is string => typeof id === "string")
    : [];
  const fromText = extractMentionLinkIds(lastUserText);
  const mentionedLinkIds = [...new Set([...fromBody, ...fromText])];

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(uiMessages);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid messages" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await streamChatForUser({
    messages: modelMessages,
    userId,
    mentionedLinkIds,
    searchQuery: lastUserText,
    onFinish: async ({ text: assistantText }) => {
      await appendAssistantChatMessage({
        chatId,
        userId,
        text: assistantText,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
  });
}
