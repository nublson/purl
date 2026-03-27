import { scrapeLinkMetadata } from "@/lib/links";
import { isValidUrl } from "@/utils/url";
import { NextRequest, NextResponse } from "next/server";

/** Public metadata fetch for marketing preview (hero). No auth. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!url || !isValidUrl(url)) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const meta = await scrapeLinkMetadata(url);
    return NextResponse.json(meta);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch metadata" },
      { status: 502 },
    );
  }
}
