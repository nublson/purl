import { mapFolderError, parseEmojiField } from "@/lib/folder-errors";
import { createFolder, listFoldersForUser } from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../cors";

export async function OPTIONS(_request: NextRequest): Promise<Response> {
  return corsPreflightResponse();
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const folders = await listFoldersForUser(user.id);
  return addCors(NextResponse.json(folders));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  let body: { name?: unknown; emoji?: unknown };
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const name = typeof body?.name === "string" ? body.name : "";
  const emoji = parseEmojiField(body?.emoji);
  if (emoji instanceof NextResponse) return addCors(emoji);

  try {
    const folder = await createFolder(user.id, name, emoji);
    broadcastLinksChanged(user.id);
    return addCors(NextResponse.json(folder, { status: 201 }));
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return addCors(mapped);
    throw e;
  }
}
