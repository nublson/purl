import { buildAtomFeed } from "@/lib/atom-feed";
import { publicFolderFeedPath } from "@/lib/public-folder-path";
import {
  listPublicFolderLinks,
  resolvePublicFolder,
} from "@/lib/public-folders";
import { type NextRequest, NextResponse } from "next/server";

/**
 * A shared folder's Atom feed: /@username/slug/feed.xml (rewritten to this
 * route in next.config.ts). First page of links only, no session, CDN-cached
 * for five minutes. Private and missing folders answer 404; a renamed
 * username or slug redirects to the current feed URL.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string; slug: string }> },
) {
  const { username, slug } = await context.params;
  const page = await resolvePublicFolder(username, slug);
  if (!page) return new NextResponse("Not found", { status: 404 });
  if (page.kind === "redirect") {
    return NextResponse.redirect(
      new URL(
        publicFolderFeedPath(page.username, page.slug),
        process.env.BASE_URL || request.nextUrl.origin,
      ),
      308,
    );
  }

  const { links } = await listPublicFolderLinks(page.ids);
  const xml = buildAtomFeed({
    origin: process.env.BASE_URL || request.nextUrl.origin,
    owner: page.owner,
    folder: page.folder,
    links,
  });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      // Never a shared cache: making the folder private must end the feed at
      // once (a CDN would keep serving its links until the entry expired).
      // Visitors' own browsers may reuse it briefly, like the load-more API.
      "Cache-Control": "private, max-age=60",
      "X-Robots-Tag": "noindex",
    },
  });
}
