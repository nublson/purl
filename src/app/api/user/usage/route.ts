import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import { NextResponse } from "next/server";

/**
 * The signed-in user's Settings → Usage numbers (`{ saves, storage }`), for
 * `UsageProvider` to refetch after uploads and deletes.
 */
export async function GET() {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getUsageSummaryForUser(userId), {
    headers: { "Cache-Control": "no-store" },
  });
}
