import { resolveLinkFromUrl } from "@/lib/links";
import { getSessionUser } from "@/lib/session";
import { parseHttpUrl } from "@/utils/url";
import { type NextRequest, NextResponse } from "next/server";

/**
 * What a URL would look like saved, without saving it: title, favicon,
 * domain, content type (`url` query param). Used by the search field's Save
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

  const preview = await resolveLinkFromUrl(url.toString());
  return NextResponse.json(
    {
      url: preview.url,
      domain: preview.domain,
      title: preview.title,
      description: preview.description,
      favicon: preview.favicon,
      thumbnail: preview.thumbnail,
      contentType: preview.contentType,
    },
    // Typing the same URL again within a few minutes reuses it.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
