import { parseBulkDeleteBody, parseBulkMoveBody } from "@/lib/bulk-links";
import { FolderNotFoundError } from "@/lib/folders";
import { deleteLinksForUser, moveLinksToFolder } from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../../cors";

export async function OPTIONS(): Promise<Response> {
  return corsPreflightResponse();
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Moves many links at once: `{ ids, folderId }` (`folderId: null` takes them
 * out of their folders). Same shapes as the app's `PATCH /api/links/bulk`.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const body = await readJson(request);
  if (body === undefined) {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }
  const parsed = parseBulkMoveBody(body);
  if (!parsed.ok) {
    return addCors(
      NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 }),
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  try {
    const result = await moveLinksToFolder(user.id, parsed.ids, parsed.folderId);
    if (result.moved.length > 0) broadcastLinksChanged(user.id);
    return addCors(NextResponse.json(result));
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      return addCors(NextResponse.json({ error: "Folder not found" }, { status: 404 }));
    }
    throw e;
  }
}

/** Deletes many links at once: `{ ids }`. Responds `{ deleted: number }`. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const body = await readJson(request);
  if (body === undefined) {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }
  const parsed = parseBulkDeleteBody(body);
  if (!parsed.ok) {
    return addCors(
      NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 }),
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const deleted = await deleteLinksForUser(user.id, parsed.ids);
  if (deleted > 0) broadcastLinksChanged(user.id);
  return addCors(NextResponse.json({ deleted }));
}
