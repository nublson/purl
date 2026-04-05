import { auth } from "@/lib/auth";
import {
  getChatMessagesAsUIMessages,
  UnauthorizedChatError,
} from "@/lib/chats";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await context.params;
  if (!chatId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await getChatMessagesAsUIMessages(
      chatId,
      session.user.id,
    );
    return NextResponse.json({ messages });
  } catch (e) {
    if (e instanceof UnauthorizedChatError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof Error && e.name === "ChatNotFoundError") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
