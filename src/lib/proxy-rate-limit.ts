import {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
  getUploadPostRateLimiter,
} from "@/lib/upstash-rate-limit";
import { type NextRequest, NextResponse } from "next/server";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

function tooManyRequests(reset: number) {
  const retryAfterSec = Math.max(
    1,
    Math.ceil((reset - Date.now()) / 1000),
  );
  return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec),
    },
  });
}

/**
 * Edge rate limits for sensitive API routes. Returns a response when the limit is exceeded.
 * For `/api/auth/*`, returns `NextResponse.next()` when allowed so the rest of the proxy can skip session work.
 * Also limits POST `/api/feedback`.
 */
export async function rateLimitApiRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const ip = clientIp(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth")) {
    const limiter = getAuthRateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(ip);
      if (!success) return tooManyRequests(reset);
    }
    return NextResponse.next();
  }

  if (pathname === "/api/chat" && request.method === "POST") {
    const limiter = getChatPostRateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(ip);
      if (!success) return tooManyRequests(reset);
    }
    return null;
  }

  if (pathname === "/api/links" && request.method === "POST") {
    const limiter = getLinksPostRateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(ip);
      if (!success) return tooManyRequests(reset);
    }
    return null;
  }

  if (pathname === "/api/upload" && request.method === "POST") {
    const limiter = getUploadPostRateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(ip);
      if (!success) return tooManyRequests(reset);
    }
    return null;
  }

  if (pathname === "/api/feedback" && request.method === "POST") {
    const limiter = getFeedbackPostRateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(ip);
      if (!success) return tooManyRequests(reset);
    }
    return null;
  }

  return null;
}
