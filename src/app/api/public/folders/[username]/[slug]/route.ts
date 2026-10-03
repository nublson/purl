import { getPublicFolderPage } from "@/lib/public-folders";
import { type NextRequest, NextResponse } from "next/server";

/**
 * A shared folder's links for visitors, one page at a time (`cursor` from
 * the previous page): the shared page's "load more". No session needed;
 * rate-limited per IP in the proxy. Private, missing and renamed folders
 * all answer 404 (the page itself handles renames with a redirect).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string; slug: string }> },
) {
  const { username, slug } = await context.params;
  const page = await getPublicFolderPage(username, slug, {
    cursor: request.nextUrl.searchParams.get("cursor"),
  });
  if (!page || page.kind !== "folder") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(
    { links: page.links, nextCursor: page.nextCursor },
    // Visitors' browsers may reuse it briefly; never shared caches.
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
