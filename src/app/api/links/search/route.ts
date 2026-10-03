import { FolderNotFoundError } from "@/lib/folders";
import { searchLinksForUser } from "@/lib/links";
import { serializeLink } from "@/lib/serialize-link";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

/** Results per search unless `limit` asks for fewer or more (capped). */
const DEFAULT_LIMIT = 50;

/**
 * Searches the signed-in user's links: `q` (title, domain or URL, case-
 * insensitive; blank lists everything), `notInFolderId` (leave out that
 * folder's links), `limit`. Newest first. Responds `{ links, hasMore }`.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit") ?? DEFAULT_LIMIT);
  try {
    const result = await searchLinksForUser(user.id, {
      query: params.get("q") ?? "",
      notInFolderId: params.get("notInFolderId") || undefined,
      limit: Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT,
    });
    return NextResponse.json({
      links: result.links.map(serializeLink),
      hasMore: result.hasMore,
    });
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    throw e;
  }
}
