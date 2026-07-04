import { auth } from "@/lib/auth";
import {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
  getMcpRateLimiter,
  getUploadPostRateLimiter,
  getV1PostRateLimiter,
  getV1RateLimiter,
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

/**
 * Resolves a per-user rate limit key from a Bearer API key, falling back to the
 * raw token (if session resolution fails) or the client IP (if no Bearer header
 * is present). Shared by `/api/v1/*` and `/api/mcp` so all keys from the same
 * user share one bucket rather than one per key.
 */
async function resolveBearerRateLimitKey(
  request: NextRequest,
  ip: string,
): Promise<string> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.length <= 7) {
    return ip;
  }
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? authHeader.slice(7);
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

  if (pathname.startsWith("/api/v1/")) {
    const rateLimitKey = await resolveBearerRateLimitKey(request, ip);
    const limiter = request.method === "POST" ? getV1PostRateLimiter() : getV1RateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(rateLimitKey);
      if (!success) return tooManyRequests(reset);
    }
    return null;
  }

  if (pathname.startsWith("/api/mcp")) {
    const rateLimitKey = await resolveBearerRateLimitKey(request, ip);
    const limiter = getMcpRateLimiter();
    if (limiter) {
      const { success, reset } = await limiter.limit(rateLimitKey);
      if (!success) return tooManyRequests(reset);
    }
    return null;
  }

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
