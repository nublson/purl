import { NextResponse } from "next/server";
import { getPublishedFile } from "@/lib/notion";

export const runtime = "nodejs";

/** Stop serving a cached redirect this long before its signed URL expires. */
const EXPIRY_MARGIN_SECONDS = 600;

/** The CDN keeps a redirect at most this long. */
const MAX_CDN_SECONDS = 1800;

/**
 * Redirects to a fresh URL for a file uploaded to a static page in Notion.
 * Notion's signed URLs expire after an hour, longer than the pages are
 * cached, so the rendered pages point here (notionic's `transformFileUrl`).
 * The CDN keeps the redirect until shortly before the URL it points to expires;
 * browsers ask again each time.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ blockId: string }> },
) {
  const { blockId } = await params;
  let file: Awaited<ReturnType<typeof getPublishedFile>>;
  try {
    file = await getPublishedFile(blockId);
  } catch (error) {
    console.error(`[notion] file ${blockId}: could not read it`, error);
    return NextResponse.json(
      { error: "Couldn't load the file" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const remaining = Math.floor(
    (file.expiresAt.getTime() - Date.now()) / 1000 - EXPIRY_MARGIN_SECONDS,
  );
  const cdnSeconds = Math.min(Math.max(remaining, 0), MAX_CDN_SECONDS);
  const response = NextResponse.redirect(file.url, 307);
  response.headers.set(
    "Cache-Control",
    cdnSeconds > 0 ? `public, max-age=0, s-maxage=${cdnSeconds}` : "no-store",
  );
  return response;
}
