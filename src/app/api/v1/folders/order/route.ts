import { mapFolderError, parseFolderOrderBody } from "@/lib/folder-errors";
import { reorderFolders } from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../../cors";

export async function OPTIONS(_request: NextRequest): Promise<Response> {
  return corsPreflightResponse();
}

/** Sets the folder order: `{ ids }` lists every folder, first to last. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const ids = parseFolderOrderBody(body);
  if (ids instanceof NextResponse) return addCors(ids);

  try {
    const folders = await reorderFolders(user.id, ids);
    broadcastLinksChanged(user.id);
    return addCors(NextResponse.json({ folders }));
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return addCors(mapped);
    throw e;
  }
}
