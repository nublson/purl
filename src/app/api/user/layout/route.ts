import { parseLayoutChange } from "@/lib/link-view";
import { setLayoutForUser } from "@/lib/link-view-store";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

/**
 * Saves the current user's layout settings: `{ view?: "list" | "grid",
 * folderTags?: boolean }`, at least one. Responds with what was saved.
 */
export async function PATCH(request: NextRequest) {
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

  const change = parseLayoutChange(body);
  if (!change) {
    return NextResponse.json(
      {
        error: 'Send view ("list" or "grid") and/or folderTags (true or false)',
        code: "INVALID_LAYOUT",
      },
      { status: 400 },
    );
  }

  await setLayoutForUser(userId, change);
  return NextResponse.json(change);
}
