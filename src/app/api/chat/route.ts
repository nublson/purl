import { auth } from "@/lib/auth";
import { buildMentionContext, streamChatResponse } from "@/lib/chat";
import { saveMessage, verifyChatOwnership } from "@/lib/chats";
import { convertToModelMessages, type UIMessage } from "ai";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let messages: UIMessage[];
  let chatId: string;
  let mentionedLinkIds: string[] | undefined;

  try {
    const body = await request.json();
    messages = body.messages;
    chatId = body.chatId;
    mentionedLinkIds = body.mentionedLinkIds;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!chatId || typeof chatId !== "string") {
    return NextResponse.json(
      { error: "chatId is required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array is required" },
      { status: 400 },
    );
  }

  const isOwner = await verifyChatOwnership(chatId, session.user.id);
  if (!isOwner) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const query = lastUserMessage?.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ") ?? "";

  const context =
    mentionedLinkIds && mentionedLinkIds.length > 0
      ? await buildMentionContext(mentionedLinkIds)
      : null;

  const modelMessages = await convertToModelMessages(messages);

  await saveMessage(chatId, "USER", query, mentionedLinkIds);

  const result = streamChatResponse(
    modelMessages,
    session.user.id,
    context,
    async (text) => {
      await saveMessage(chatId, "ASSISTANT", text);
    },
  );

  return result.toUIMessageStreamResponse();
}
