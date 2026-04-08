import { refreshLink, UnauthorizedError } from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { serializeLink } from "@/lib/serialize-link";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const refreshed = await refreshLink(id);
    if (!refreshed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await broadcastLinksChanged(refreshed.userId);
    return NextResponse.json(serializeLink(refreshed));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
