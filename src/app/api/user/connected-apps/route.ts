import { listConnectedApps } from "@/lib/connected-apps";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listConnectedApps(userId);
  return NextResponse.json(apps);
}
