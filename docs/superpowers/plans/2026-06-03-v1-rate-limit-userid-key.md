# v1 Rate Limit: userId Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `/api/v1/` rate limiting to key on `userId` instead of the raw Bearer token, so all API keys from the same user share a single rate-limit bucket.

**Architecture:** `rateLimitApiRequest` in `src/lib/proxy-rate-limit.ts` currently extracts the Bearer token and uses it as the Upstash rate-limit key. We add `auth.api.getSession({ headers: request.headers })` for v1 requests that carry a Bearer token — `enableSessionForAPIKeys: true` in `src/lib/auth.ts` makes `getSession` resolve Bearer tokens into real sessions. The resolved `userId` becomes the rate-limit key. We fall back to the raw Bearer token if session resolution fails (invalid/expired key) and to client IP if there's no Bearer header at all. The `auth` import already works in the middleware runtime because `proxy.ts` calls `auth.api.getSession` for all non-v1 routes.

**Tech Stack:** Next.js middleware, Upstash Ratelimit (sliding window), Better Auth `getSession`, Vitest

---

## Codebase Context

Read these files before implementing:

- `src/lib/proxy-rate-limit.ts` — the file being changed; note the existing v1 branch structure
- `src/lib/proxy-rate-limit.test.ts` — the test file; note the existing mock setup at the top and the `"v1 api rate limiting"` describe block
- `src/proxy.ts` — confirms `auth` import works in this runtime (`auth.api.getSession` is called there)

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/lib/proxy-rate-limit.ts` | Add `auth` import; resolve session for Bearer requests; use `userId` as key |
| Modify | `src/lib/proxy-rate-limit.test.ts` | Add `@/lib/auth` mock; update v1 describe block tests |

---

## Task 1: Upgrade v1 rate-limit key to userId

**Files:**
- Modify: `src/lib/proxy-rate-limit.ts`
- Modify: `src/lib/proxy-rate-limit.test.ts`

- [ ] **Step 1: Write failing tests first**

Read `src/lib/proxy-rate-limit.test.ts` to understand the current structure. Then make the following changes to it:

**1a. Add `mockGetSession` and `@/lib/auth` mock** — add these two blocks right after the existing `const limitMock = vi.fn();` line at the top of the file:

```typescript
const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));
```

**1b. Replace the entire `"v1 api rate limiting"` describe block** (currently at the bottom of the file) with:

```typescript
describe("v1 api rate limiting", () => {
  beforeEach(() => {
    limitMock.mockReset();
    vi.mocked(getV1RateLimiter).mockReset();
    vi.mocked(getV1PostRateLimiter).mockReset();
    mockGetSession.mockReset();
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

  it("uses userId from resolved session as rate limit key", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    mockGetSession.mockResolvedValue({ user: { id: "user-abc" } });
    const request = new NextRequest("http://localhost/api/v1/links", {
      method: "GET",
      headers: { authorization: "Bearer purl_abc123" },
    });
    await rateLimitApiRequest(request);
    expect(mockGetSession).toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledWith("user-abc");
  });

  it("falls back to Bearer token when session resolution returns null", async () => {
    vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
    limitMock.mockResolvedValue({ success: true, reset: 0 });
    mockGetSession.mockResolvedValue(null);
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
    expect(mockGetSession).not.toHaveBeenCalled();
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
    expect(mockGetSession).not.toHaveBeenCalled();
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

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run src/lib/proxy-rate-limit.test.ts
```

Expected: the two new tests (`"uses userId from resolved session"` and `"falls back to Bearer token when session resolution returns null"`) fail because `proxy-rate-limit.ts` doesn't call `getSession` yet.

- [ ] **Step 3: Update `src/lib/proxy-rate-limit.ts`**

Read the file first. Then make two changes:

**3a. Add `auth` import** at the top (insert after the existing imports, keeping alphabetical order):

```typescript
import { auth } from "@/lib/auth";
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
```

**3b. Replace the `/api/v1/` branch** inside `rateLimitApiRequest`:

```typescript
if (pathname.startsWith("/api/v1/")) {
  const authHeader = request.headers.get("authorization");
  let rateLimitKey: string;

  if (authHeader?.startsWith("Bearer ") && authHeader.length > 7) {
    // Resolve Bearer token to userId so all keys from the same user share one bucket.
    // enableSessionForAPIKeys: true makes getSession understand Bearer tokens.
    const session = await auth.api.getSession({ headers: request.headers });
    rateLimitKey = session?.user?.id ?? authHeader.slice(7);
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

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run src/lib/proxy-rate-limit.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass. (The pre-existing flaky avatar test at `src/app/api/user/avatar/route.test.ts` may fail intermittently due to a 1ms timestamp race — it is confirmed pre-existing and passes in isolation. Ignore it if it's the only failure.)

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/proxy-rate-limit.ts src/lib/proxy-rate-limit.test.ts
git commit -m "feat(rate-limit): key v1 limits on userId via session resolution, fall back to token"
```

---

## Behavior After This Change

| Request | Session resolves? | Rate limit key |
|---|---|---|
| `GET /api/v1/links` with valid `Bearer purl_abc` | ✅ userId = `"usr_1"` | `usr_1` |
| `GET /api/v1/links` with expired `Bearer purl_abc` | ❌ null | `purl_abc` (token) |
| `GET /api/v1/links` with no Authorization header | — | client IP |
| `POST /api/v1/links` with valid Bearer | ✅ | `usr_1` (60/min bucket) |

Two API keys from the same user now share a single 120 req/min (or 60 req/min for POST) bucket, matching the original plan spec of "keyed on userId".

## Tradeoff Note

This adds one `getSession` DB lookup per v1 request in the proxy, which is then repeated in the route handler. This is the cost of per-user rate limiting without a shared request context. The lookup is fast (indexed session token lookup) and consistent with what the proxy already does for all non-v1 routes.
