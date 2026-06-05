import { auth } from "@/lib/auth";
import { chatJsonError } from "@/lib/chat-api-error-response";
import { CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { deleteChat, getChatWithMessages, updateChatTitle } from "@/lib/chats";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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

export async function PATCH(request: NextRequest, { params }: Params) {
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
  let title: string | undefined;
  try {
    const body = await request.json();
    title = typeof body?.title === "string" ? body.title : undefined;
  } catch {
    title = undefined;
  }

  if (!title?.trim()) {
    return chatJsonError(
      400,
      CHAT_ERROR_CODES.INTERNAL_ERROR,
      "Title is required.",
    );
  }

  const updated = await updateChatTitle(id, title);
  if (!updated) {
    return chatJsonError(
      404,
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Chat not found.",
    );
  }

  return NextResponse.json(updated);
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
