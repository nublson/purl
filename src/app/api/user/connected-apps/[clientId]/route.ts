import { revokeConnectedApp } from "@/lib/connected-apps";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await context.params;
  const revoked = await revokeConnectedApp(userId, clientId);

  if (!revoked) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
