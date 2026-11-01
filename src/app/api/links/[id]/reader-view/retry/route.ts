import { auth } from "@/lib/auth";
import { tooManyRequests } from "@/lib/proxy-rate-limit";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { resetFailedReaderView } from "@/lib/reader-views";
import { getLinkPreviewRateLimiter } from "@/lib/upstash-rate-limit";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/** Asks for a failed reader view to be built again (the cron picks it up). */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = getLinkPreviewRateLimiter();
  if (limiter) {
    const { success, reset } = await limiter.limit(userId);
    if (!success) return tooManyRequests(reset);
  }

  const { id } = await context.params;
  const result = await resetFailedReaderView(userId, id);
  if (result === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result === "not_failed") {
    return NextResponse.json(
      { error: "The reader view isn't failed.", code: "NOT_FAILED" },
      { status: 409 },
    );
  }
  await broadcastLinksChanged(userId);
  return NextResponse.json({ ok: true });
}
