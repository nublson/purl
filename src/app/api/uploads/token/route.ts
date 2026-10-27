import type { HandleUploadBody } from "@vercel/blob/client";
import { LimitError } from "@/lib/entitlements";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { issueUploadToken, UploadRejectedError } from "@/lib/upload-token";
import { uploadsEnabled } from "@/lib/uploads";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** The browser's `upload()` asks here for a short-lived Blob client token. */
export async function POST(request: Request) {
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

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    return NextResponse.json(await issueUploadToken(userId, body, request));
  } catch (e) {
    if (e instanceof UploadRejectedError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    if (e instanceof LimitError) {
      return NextResponse.json(
        { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
        { status: 403 },
      );
    }
    throw e;
  }
}
