import { auth } from "@/lib/auth";
import { deleteChat, getChatWithMessages } from "@/lib/chats";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const chat = await getChatWithMessages(id);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json(chat);
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteChat(id);
  if (!deleted) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
