import { mapFolderError } from "@/lib/folder-errors";
import { deleteFolder, renameFolder } from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name : "";

  try {
    const { id } = await context.params;
    const folder = await renameFolder(userId, id, name);
    broadcastLinksChanged(
      userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json(folder);
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withLinks = request.nextUrl.searchParams.get("withLinks") === "true";

  try {
    const { id } = await context.params;
    const result = await deleteFolder(userId, id, { withLinks });
    broadcastLinksChanged(
      userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json(result);
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return mapped;
    throw e;
  }
}
