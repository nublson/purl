import {
  createChatForCurrentUser,
  listChatsForCurrentUser,
  UnauthorizedChatError,
} from "@/lib/chats";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const chats = await listChatsForCurrentUser();
    return NextResponse.json({
      chats: chats.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof UnauthorizedChatError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}

export async function POST() {
  try {
    const chat = await createChatForCurrentUser();
    return NextResponse.json({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof UnauthorizedChatError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
