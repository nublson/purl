import {
  isBulkReadBody,
  parseBulkDeleteBody,
  parseBulkMoveBody,
  parseBulkReadBody,
} from "@/lib/bulk-links";
import { FolderNotFoundError } from "@/lib/folders";
import {
  deleteLinksForUser,
  markLinksReadForUser,
  moveLinksToFolder,
} from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Moves many links at once: `{ ids, folderId }` (`folderId: null` takes them
 * out of their folders). Responds `{ moved: [{ id, previousFolderId }],
 * notFound: [id] }`; ids that aren't yours are reported, not an error.
 *
 * Or marks them read or unread: `{ ids, read }`. Responds `{ updated }`, how
 * many links changed (ids that aren't yours are skipped).
 */
export async function PATCH(request: NextRequest) {
  const body = await readJson(request);
  if (body === undefined) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (isBulkReadBody(body)) return markRead(request, body);
  const parsed = parseBulkMoveBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, code: parsed.code },
      { status: 400 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await moveLinksToFolder(user.id, parsed.ids, parsed.folderId);
    if (result.moved.length > 0) {
      broadcastLinksChanged(
        user.id,
        parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    throw e;
  }
}

async function markRead(request: NextRequest, body: unknown) {
  const parsed = parseBulkReadBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, code: parsed.code },
      { status: 400 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await markLinksReadForUser(user.id, parsed.ids, parsed.read);
  if (updated > 0) {
    broadcastLinksChanged(
      user.id,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
  }
  return NextResponse.json({ updated });
}

/** Deletes many links at once: `{ ids }`. Responds `{ deleted: number }`. */
export async function DELETE(request: NextRequest) {
  const body = await readJson(request);
  if (body === undefined) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseBulkDeleteBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, code: parsed.code },
      { status: 400 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await deleteLinksForUser(user.id, parsed.ids);
  if (deleted > 0) {
    broadcastLinksChanged(
      user.id,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
  }
  return NextResponse.json({ deleted });
}
