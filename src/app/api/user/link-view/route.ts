import { parseLinkView } from "@/lib/link-view";
import { setLinkViewForUser } from "@/lib/link-view-store";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

/** Saves how the current user's lists show links: `{ view: "list" | "grid" }`. */
export async function PATCH(request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { view?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const view = parseLinkView(body?.view);
  if (!view) {
    return NextResponse.json(
      { error: 'view must be "list" or "grid"', code: "INVALID_VIEW" },
      { status: 400 },
    );
  }

  await setLinkViewForUser(userId, view);
  return NextResponse.json({ view });
}
