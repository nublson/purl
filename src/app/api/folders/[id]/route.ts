import {
  deleteFolder,
  FolderLimitError,
  FolderNameError,
  FolderNotFoundError,
  renameFolder,
} from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

const NAME_ERROR_CODES: Record<FolderNameError["reason"], string> = {
  empty: "NAME_EMPTY",
  too_long: "NAME_TOO_LONG",
  taken: "NAME_TAKEN",
};

const NAME_ERROR_STATUS: Record<FolderNameError["reason"], number> = {
  empty: 400,
  too_long: 400,
  taken: 409,
};

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
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    if (e instanceof FolderNameError) {
      return NextResponse.json(
        { error: e.message, code: NAME_ERROR_CODES[e.reason] },
        { status: NAME_ERROR_STATUS[e.reason] },
      );
    }
    if (e instanceof FolderLimitError) {
      return NextResponse.json(
        { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
        { status: 403 },
      );
    }
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
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    throw e;
  }
}
