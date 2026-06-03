# Public API v1 Rate Limiting — Per-Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/api/v1/` rate limiting from IP-based (one shared bucket) to per-API-key with split limits — `POST /api/v1/links` at 60 req/min, all other v1 endpoints at 120 req/min.

**Architecture:** The proxy middleware (`src/proxy.ts`) calls `rateLimitApiRequest()` before routing. The v1 branch of that function currently keys on client IP. We'll change it to extract the raw Bearer token from the `Authorization` header and use it as the rate limit key (falling back to IP when absent). This avoids an extra DB call in the proxy while achieving per-key isolation. A second Upstash limiter (`v1_post`, 60 req/min) is added for POST requests; the existing `v1` limiter (120 req/min) handles everything else.

**Tech Stack:** Upstash Redis + `@upstash/ratelimit` (sliding window), Next.js middleware, Vitest

**Note:** CORS is already done — `addCors()` and `corsPreflightResponse()` are applied in every `/api/v1/links` route handler. This plan is rate-limiting only.

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/lib/upstash-rate-limit.ts` | Add `getV1PostRateLimiter()` (60 req/min, prefix `purl:rl:v1_post`) |
| Modify | `src/lib/proxy-rate-limit.ts` | v1 branch: extract Bearer token as key, use correct limiter per method |
| Modify | `src/lib/proxy-rate-limit.test.ts` | Add v1-specific tests: Bearer key, POST limiter, fallback to IP |

---

## Task 1: Add `getV1PostRateLimiter` to `upstash-rate-limit.ts`

**Files:**
- Modify: `src/lib/upstash-rate-limit.ts`

No new test file needed for this task — the limiter factory follows the same pattern as all existing limiters and is exercised through `proxy-rate-limit.test.ts` in Task 2.

- [ ] **Step 1: Add the limiter factory and cached getter**

Open `src/lib/upstash-rate-limit.ts`. After the existing `v1Limiter` line, add the new `v1PostLimiter` and its cache variable and getter. The final file should look like:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redisSingleton: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) {
    return redisSingleton;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production.",
      );
    }
    redisSingleton = null;
    return null;
  }
  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

function makeLimiter(
  name: string,
  max: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    prefix: `purl:rl:${name}`,
    analytics: false,
  });
}

const authLimiter = () => makeLimiter("auth", 30, "1 m");
const chatPostLimiter = () => makeLimiter("chat_post", 30, "1 m");
const linksPostLimiter = () => makeLimiter("links_post", 30, "1 m");
const uploadPostLimiter = () => makeLimiter("upload_post", 20, "1 m");
const feedbackPostLimiter = () => makeLimiter("feedback_post", 10, "1 m");

const v1Limiter = () => makeLimiter("v1", 120, "1 m");
const v1PostLimiter = () => makeLimiter("v1_post", 60, "1 m");

let cachedAuth: Ratelimit | null | undefined;
let cachedChat: Ratelimit | null | undefined;
let cachedLinksPost: Ratelimit | null | undefined;
let cachedUploadPost: Ratelimit | null | undefined;
let cachedV1: Ratelimit | null | undefined;
let cachedV1Post: Ratelimit | null | undefined;
let cachedFeedbackPost: Ratelimit | null | undefined;

export function getAuthRateLimiter(): Ratelimit | null {
  if (cachedAuth === undefined) cachedAuth = authLimiter();
  return cachedAuth;
}

export function getChatPostRateLimiter(): Ratelimit | null {
  if (cachedChat === undefined) cachedChat = chatPostLimiter();
  return cachedChat;
}

export function getLinksPostRateLimiter(): Ratelimit | null {
  if (cachedLinksPost === undefined) cachedLinksPost = linksPostLimiter();
  return cachedLinksPost;
}

export function getUploadPostRateLimiter(): Ratelimit | null {
  if (cachedUploadPost === undefined) cachedUploadPost = uploadPostLimiter();
  return cachedUploadPost;
}

export function getV1RateLimiter(): Ratelimit | null {
  if (cachedV1 === undefined) cachedV1 = v1Limiter();
  return cachedV1;
}

export function getV1PostRateLimiter(): Ratelimit | null {
  if (cachedV1Post === undefined) cachedV1Post = v1PostLimiter();
  return cachedV1Post;
}

export function getFeedbackPostRateLimiter(): Ratelimit | null {
  if (cachedFeedbackPost === undefined) {
    cachedFeedbackPost = feedbackPostLimiter();
  }
  return cachedFeedbackPost;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/upstash-rate-limit.ts
git commit -m "feat(rate-limit): add getV1PostRateLimiter for 60 req/min POST limit"
```

---

## Task 2: Update v1 rate-limit branch + tests

**Files:**
- Modify: `src/lib/proxy-rate-limit.ts`
- Modify: `src/lib/proxy-rate-limit.test.ts`

**Design:**
- Extract the raw Bearer token (the value after `"Bearer "` in the `Authorization` header) as the rate limit key.
- If no valid Bearer header, fall back to the client IP.
- Use `getV1PostRateLimiter()` for `POST` requests and `getV1RateLimiter()` for everything else.

- [ ] **Step 1: Write new failing tests**

Open `src/lib/proxy-rate-limit.test.ts`. The file already has a `"v1 api rate limiting"` describe block at the bottom (lines 261–281). Replace that entire block with the following expanded version:

```typescript
describe("v1 api rate limiting", () => {
  beforeEach(() => {
    limitMock.mockReset();
    vi.mocked(getV1RateLimiter).mockReset();
    vi.mocked(getV1PostRateLimiter).mockReset();
  });

  it("uses getV1RateLimiter for GET /api/v1/links and returns 429 when exceeded", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
    });
    const result = await rateLimitApiRequest(request);
    expect(result?.status).toBe(429);
    expect(getV1RateLimiter).toHaveBeenCalled();
    expect(getV1PostRateLimiter).not.toHaveBeenCalled();
  });

  it("returns null for GET /api/v1/links when under the limit", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
    });
    const result = await rateLimitApiRequest(request);
    expect(result).toBeNull();
  });

  it("uses getV1PostRateLimiter for POST /api/v1/links and returns 429 when exceeded", async () => {
    vi.mocked(getV1PostRateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "POST",
    });
    const result = await rateLimitApiRequest(request);
    expect(result?.status).toBe(429);
    expect(getV1PostRateLimiter).toHaveBeenCalled();
    expect(getV1RateLimiter).not.toHaveBeenCalled();
  });

  it("returns null for POST /api/v1/links when under the limit", async () => {
    vi.mocked(getV1PostRateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "POST",
    });
    const result = await rateLimitApiRequest(request);
    expect(result).toBeNull();
  });

  it("uses Bearer token as rate limit key when Authorization header is present", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
      headers: { authorization: "Bearer purl_abc123" },
    });
    await rateLimitApiRequest(request);
    expect(limitMock).toHaveBeenCalledWith("purl_abc123");
  });

  it("falls back to IP when no Authorization header is present", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
      headers: { "x-forwarded-for": "5.5.5.5" },
    });
    await rateLimitApiRequest(request);
    expect(limitMock).toHaveBeenCalledWith("5.5.5.5");
  });

  it("falls back to IP when Authorization header is malformed", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
      headers: {
        authorization: "Basic dXNlcjpwYXNz",
        "x-forwarded-for": "7.7.7.7",
      },
    });
    await rateLimitApiRequest(request);
    expect(limitMock).toHaveBeenCalledWith("7.7.7.7");
  });

  it("returns null (no limiter configured) without error for GET /api/v1/links", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(null);
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
    });
    const result = await rateLimitApiRequest(request);
    expect(result).toBeNull();
  });
});
```

Also update the mock at the top of the file to include `getV1PostRateLimiter`. Find the `vi.mock("@/lib/upstash-rate-limit", ...)` block and replace it with:

```typescript
vi.mock("@/lib/upstash-rate-limit", () => ({
  getAuthRateLimiter: vi.fn(),
  getChatPostRateLimiter: vi.fn(),
  getFeedbackPostRateLimiter: vi.fn(),
  getLinksPostRateLimiter: vi.fn(),
  getUploadPostRateLimiter: vi.fn(),
  getV1RateLimiter: vi.fn().mockReturnValue({ limit: limitMock }),
  getV1PostRateLimiter: vi.fn(),
}));
```

And update the destructured import to include `getV1PostRateLimiter`:

```typescript
const {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
  getUploadPostRateLimiter,
  getV1RateLimiter,
  getV1PostRateLimiter,
} = await import("@/lib/upstash-rate-limit");
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/lib/proxy-rate-limit.test.ts
```

Expected: FAIL — `getV1PostRateLimiter` not called, Bearer token not used as key.

- [ ] **Step 3: Update `proxy-rate-limit.ts`**

Replace the entire `/api/v1/` branch in `rateLimitApiRequest`. The function's v1 block should become:

```typescript
if (pathname.startsWith("/api/v1/")) {
  const authHeader = request.headers.get("authorization");
  let rateLimitKey: string;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ") && authHeader.length > 7) {
    rateLimitKey = authHeader.slice(7);
  } else {
    rateLimitKey = ip;
  }

  const limiter = request.method === "POST" ? getV1PostRateLimiter() : getV1RateLimiter();
  if (limiter) {
    const { success, reset } = await limiter.limit(rateLimitKey);
    if (!success) return tooManyRequests(reset);
  }
  return null;
}
```

Also update the import at the top to include `getV1PostRateLimiter`:

```typescript
import {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
  getUploadPostRateLimiter,
  getV1PostRateLimiter,
  getV1RateLimiter,
} from "@/lib/upstash-rate-limit";
```

The full `proxy-rate-limit.ts` after the change:

```typescript
import {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
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
    const authHeader = request.headers.get("authorization");
    let rateLimitKey: string;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ") && authHeader.length > 7) {
      rateLimitKey = authHeader.slice(7);
    } else {
      rateLimitKey = ip;
    }

    const limiter = request.method === "POST" ? getV1PostRateLimiter() : getV1RateLimiter();
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
```

- [ ] **Step 4: Run the tests**

```bash
pnpm vitest run src/lib/proxy-rate-limit.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass (pre-existing flaky avatar test may fail — it's a 1ms timestamp race on that test file, confirmed pre-existing; it passes in isolation every time).

- [ ] **Step 6: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/proxy-rate-limit.ts src/lib/proxy-rate-limit.test.ts
git commit -m "feat(rate-limit): key v1 limits on Bearer token, split POST (60/min) vs general (120/min)"
```

---

## Verification

### Behavior summary after this change

| Request | Rate limit key | Limiter | Limit |
|---|---|---|---|
| `GET /api/v1/links` with `Authorization: Bearer purl_abc` | `purl_abc` | `v1` | 120/min |
| `POST /api/v1/links` with `Authorization: Bearer purl_abc` | `purl_abc` | `v1_post` | 60/min |
| `GET /api/v1/links` without auth header | client IP | `v1` | 120/min |
| `DELETE /api/v1/links/:id` with Bearer | Bearer token | `v1` | 120/min |

### Manual smoke test (requires running `pnpm dev`)

```bash
# Create an API key (needs a session cookie from the web app sign-in)
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Content-Type: application/json" \
  -b "<session-cookie>" \
  -d '{"name": "test"}'
# Copy the returned key value: purl_...

# Verify normal requests pass through
curl http://localhost:3000/api/v1/links -H "Authorization: Bearer purl_<your-key>"
# Expected: 200 (or 401 if no Upstash configured locally — rate limiter skips when no Redis)
```

Note: without Upstash Redis env vars (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`), `getRedis()` returns `null` in non-production environments, so all limiters are `null` and rate limiting is silently skipped. This is expected dev behavior.

---

## Notes

- **Bearer token as key vs userId:** Using the raw token avoids an extra DB call at proxy time. The tradeoff is that each API key gets its own bucket — a user with 3 keys gets 3×120 req/min. This is acceptable; keys are user-managed.
- **PATCH/DELETE/GET all share the 120/min `v1` limiter** — only POST is tighter at 60/min.
- **OPTIONS preflights** skip rate limiting entirely because `proxy.ts` returns `NextResponse.next()` before calling `rateLimitApiRequest` for OPTIONS requests.
