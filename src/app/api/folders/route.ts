import {
  createFolder,
  FolderLimitError,
  FolderNameError,
  listFoldersForUser,
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

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name : "";

  try {
    const folder = await createFolder(userId, name);
    broadcastLinksChanged(
      userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json(folder, { status: 201 });
  } catch (e) {
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
