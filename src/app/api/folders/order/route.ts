import { mapFolderError, parseFolderOrderBody } from "@/lib/folder-errors";
import { reorderFolders } from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

/** Sets the folder order: `{ ids }` lists every folder, first to last. */
export async function PUT(request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = parseFolderOrderBody(body);
  if (ids instanceof NextResponse) return ids;

  try {
    const folders = await reorderFolders(userId, ids);
    broadcastLinksChanged(
      userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json({ folders });
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return mapped;
    throw e;
  }
}
