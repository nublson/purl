import { auth } from "@/lib/auth";
import { resolveLinkFromUrl } from "@/lib/links";
import { isValidUrl } from "@/utils/url";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/** Metadata fetch for marketing preview (hero). Requires session to avoid unauthenticated SSRF. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!url || !isValidUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolved = await resolveLinkFromUrl(url);
    return NextResponse.json(resolved);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch metadata" },
      { status: 502 },
    );
  }
}
