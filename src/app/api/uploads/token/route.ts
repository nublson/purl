import type { HandleUploadBody } from "@vercel/blob/client";
import { LimitError } from "@/lib/entitlements";
import { tooManyRequests } from "@/lib/proxy-rate-limit";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { issueUploadToken, UploadRejectedError } from "@/lib/upload-token";
import { uploadsEnabled } from "@/lib/uploads";
import { getUploadsTokenUserRateLimiter } from "@/lib/upstash-rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TokenEvent = Extract<HandleUploadBody, { type: "blob.generate-client-token" }>;

/** Only token requests are answered here (Purl asks for no upload callbacks). */
function isTokenEvent(body: unknown): body is TokenEvent {
  if (typeof body !== "object" || body === null) return false;
  const { type, payload } = body as Record<string, unknown>;
  return (
    type === "blob.generate-client-token" &&
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).pathname === "string"
  );
}

/** The browser asks here for a short-lived Blob client token per file. */
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

  // Per user (the proxy limits per IP): a token for a file that never becomes
  // a link escapes the storage quota, so this bounds how many there can be.
  const limiter = getUploadsTokenUserRateLimiter();
  if (limiter) {
    const { success, reset } = await limiter.limit(userId);
    if (!success) return tooManyRequests(reset);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isTokenEvent(body)) {
    return NextResponse.json(
      { error: "Invalid upload event", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  // Only the fields Blob's token event defines go on: a `callbackUrl` (or
  // anything else) a client adds never reaches `handleUpload`, so no client
  // can have Blob POST an upload-completed callback anywhere.
  const { pathname, clientPayload, multipart } = body.payload;
  const event: TokenEvent = {
    type: "blob.generate-client-token",
    payload: { pathname, clientPayload, multipart },
  };

  try {
    return NextResponse.json(await issueUploadToken(userId, event, request));
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
