import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { NOTION_CACHE_TAG } from "@/lib/notion";

export const runtime = "nodejs";

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Expires every cached Notion read so the static pages show an edit on their
 * next visit. Called by a Notion automation ("Send webhook" when a page in
 * the pages database is edited) with the shared secret as `?secret=` or an
 * `Authorization: Bearer` header. The body is ignored: the pages are few, so
 * everything is refreshed.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.NOTION_REVALIDATION_SECRET?.trim();
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = bearer ?? request.nextUrl.searchParams.get("secret");

  if (!expected || !secretMatches(given?.trim() ?? null, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Expire now (not stale-while-revalidate): the next visit renders the edit.
  revalidateTag(NOTION_CACHE_TAG, { expire: 0 });

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
