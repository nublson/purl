import { auth } from "@/lib/auth";
import { chatJsonError } from "@/lib/chat-api-error-response";
import { CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import { createChat, getChatsForCurrentUser } from "@/lib/chats";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
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

  const chats = await getChatsForCurrentUser();
  return NextResponse.json({ chats });
}

export async function POST(request: NextRequest) {
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

  let title: string | undefined;
  try {
    const body = await request.json();
    title = typeof body?.title === "string" ? body.title.trim() : undefined;
  } catch {
    // No body is fine — title is optional
  }

  const chat = await createChat(title);
  return NextResponse.json(chat, { status: 201 });
}
