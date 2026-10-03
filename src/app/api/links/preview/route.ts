import { isUrlSavedForUser, resolveLinkFromUrl } from "@/lib/links";
import { getSessionUser } from "@/lib/session";
import { parseHttpUrl } from "@/utils/url";
import { type NextRequest, NextResponse } from "next/server";

/**
 * What a URL would look like saved, without saving it: title, favicon,
 * domain, content type (`url` query param), and `saved` when you already
 * have it (matched like saving matches: exact URL). Used by the search field's Save
 * row. Fetches go through the SSRF-safe outbound fetch, like saving does;
 * rate-limited per IP in the proxy.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const url = parseHttpUrl(raw);
  if (!url) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const [preview, saved] = await Promise.all([
    resolveLinkFromUrl(url.toString()),
    // As typed and normalized: the client saves the URL it sent here.
    isUrlSavedForUser(user.id, [raw.trim(), url.toString()]),
  ]);
  return NextResponse.json(
    {
      url: preview.url,
      domain: preview.domain,
      title: preview.title,
      description: preview.description,
      favicon: preview.favicon,
      thumbnail: preview.thumbnail,
      contentType: preview.contentType,
      // Whether saving it would refresh a link you already have.
      saved,
    },
    // No HTTP caching: `saved` changes as soon as you save it. The client
    // keeps previews briefly itself.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
