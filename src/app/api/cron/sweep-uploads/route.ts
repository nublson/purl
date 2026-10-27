import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { sweepOrphanUploads } from "@/lib/sweep-uploads";

export const runtime = "nodejs";
export const maxDuration = 120;

function safeEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Vercel cron (hourly, `vercel.json`): deletes uploaded blobs no row
 * references. Vercel sends `Authorization: Bearer $CRON_SECRET`; without the
 * secret configured nothing runs. Never cached, no user session.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  const given = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  if (!given || !safeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await sweepOrphanUploads());
}
