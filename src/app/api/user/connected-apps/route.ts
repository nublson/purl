import { auth } from "@/lib/auth";
import { listConnectedApps } from "@/lib/connected-apps";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listConnectedApps(session.user.id);
  return NextResponse.json(apps);
}
