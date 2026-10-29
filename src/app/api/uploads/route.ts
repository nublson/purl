import { LimitError } from "@/lib/entitlements";
import { FolderNotFoundError } from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { serializeLink } from "@/lib/serialize-link";
import {
  createUploadForUser,
  InvalidUploadError,
  parseUploadInput,
  uploadsEnabled,
} from "@/lib/uploads";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * `{ upload, folderId? }`: the browser put a file (and its preview) in Blob
 * and asks for its pearl. Browser sessions only (no API key or OAuth token).
 * Its own route, apart from `POST /api/links`, so it has its own rate limit
 * (`uploads_row`, in the proxy): a drop of many files mustn't spend the
 * link saves' budget, and fail at the last step with its bytes already in
 * Blob.
 */
export async function POST(request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!uploadsEnabled()) {
    return NextResponse.json(
      { error: "Uploads aren't available here", code: "UPLOADS_UNAVAILABLE" },
      { status: 503 },
    );
  }

  let body: { upload?: unknown; folderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upload = parseUploadInput(body?.upload);
  if (!upload) {
    return NextResponse.json(
      { error: "Invalid upload", code: "INVALID_UPLOAD" },
      { status: 400 },
    );
  }
  if (body.folderId !== undefined && typeof body.folderId !== "string") {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }
  const folderId = body.folderId as string | undefined;

  try {
    const link = await createUploadForUser(
      userId,
      upload,
      folderId !== undefined ? { folderId } : undefined,
    );
    broadcastLinksChanged(
      userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json(
      { ...serializeLink(link), moved: false },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof InvalidUploadError) {
      return NextResponse.json(
        { error: e.message, code: "INVALID_UPLOAD" },
        { status: 400 },
      );
    }
    if (e instanceof LimitError) {
      return NextResponse.json(
        { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
        { status: 403 },
      );
    }
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    throw e;
  }
}
