import { createFolder, listFoldersForUser } from "@/lib/folders";
import { mapFolderError, parseEmojiField } from "@/lib/folder-errors";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folders = await listFoldersForUser(userId);
  return NextResponse.json(folders);
}

export async function POST(request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; emoji?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name : "";
  const emoji = parseEmojiField(body?.emoji);
  if (emoji instanceof NextResponse) return emoji;

  try {
    const folder = await createFolder(userId, name, emoji);
    broadcastLinksChanged(
      userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json(folder, { status: 201 });
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return mapped;
    throw e;
  }
}
