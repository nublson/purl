import { auth } from "@/lib/auth";
import { chatJsonError } from "@/lib/chat-api-error-response";
import { CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { deleteChat, getChatWithMessages } from "@/lib/chats";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return chatJsonError(
      401,
      CHAT_ERROR_CODES.SESSION_EXPIRED,
      "Please sign in again.",
    );
  }

  const { id } = await params;
  const chat = await getChatWithMessages(id);
  if (!chat) {
    return chatJsonError(
      404,
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Chat not found.",
    );
  }

  return NextResponse.json(chat);
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return chatJsonError(
      401,
      CHAT_ERROR_CODES.SESSION_EXPIRED,
      "Please sign in again.",
    );
  }

  const { id } = await params;
  const deleted = await deleteChat(id);
  if (!deleted) {
    return chatJsonError(
      404,
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Chat not found.",
    );
  }

  return new NextResponse(null, { status: 204 });
}
