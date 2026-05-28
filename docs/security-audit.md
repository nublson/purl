# Security Audit

Audited on 2026-05-28 against the `feature/byok` branch.

---

## Medium

### `src/lib/proxy-rate-limit.ts:11` — IP spoofing bypasses rate limits

The `clientIp` function takes the *first* entry from `x-forwarded-for`. On Vercel (and most reverse proxies), the client controls everything before the last IP in that header — Vercel appends the real client IP at the end. An attacker can send `x-forwarded-for: 1.2.3.4` to make every request appear to come from a fresh IP, completely bypassing auth, chat, and upload rate limits.

```typescript
// Before — client-controlled
const first = forwarded.split(",")[0]?.trim();

// After — use the last entry, set by Vercel/the trusted proxy
const ips = forwarded.split(",").map(s => s.trim()).filter(Boolean);
const last = ips[ips.length - 1];
if (last) return last;
```

---

### `src/app/api/links/route.ts:17` — Any Chrome extension can make credentialed requests

`origin.startsWith("chrome-extension://")` allows *any* installed extension to post links as the authenticated user. A malicious extension (or one with an XSS vuln) can silently save arbitrary URLs on behalf of any signed-in user. The extension ID should be the only one allowed.

```typescript
// Before — any extension
if (origin.startsWith("chrome-extension://") || ALLOWED_ORIGINS.has(origin)) {

// After — pin to your own extension ID
const ALLOWED_EXTENSION_ID = process.env.CHROME_EXTENSION_ID?.trim();
if (
  (ALLOWED_EXTENSION_ID && origin === `chrome-extension://${ALLOWED_EXTENSION_ID}`) ||
  ALLOWED_ORIGINS.has(origin)
) {
```

Add `CHROME_EXTENSION_ID=<your-extension-id>` to `.env.example` and Vercel env vars.

---

## Low

### `next.config.ts` — `X-Frame-Options` header missing

The production CSP has `frame-ancestors 'none'` which covers modern browsers, but `X-Frame-Options: DENY` is the fallback for older browsers and should be in `BASE_SECURITY_HEADERS` so it applies in both dev and prod.

```typescript
const BASE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // add this
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...
];
```

---

### `next.config.ts` — Source maps may be exposed in production

`widenClientFileUpload: true` uploads expanded source maps to Sentry. Without `hideSourceMaps: true` in the Sentry config, those maps can be accessible in the browser bundle, leaking server-side code structure.

```typescript
// In withSentryConfig options:
{
  widenClientFileUpload: true,
  hideSourceMaps: true, // add this
}
```

---

## All Clear

| Area | Status | Notes |
|---|---|---|
| Hardcoded secrets | ✅ | No keys in source; `.env*` gitignored; `server-only` guards on all sensitive modules |
| Supabase service role | ✅ | `SUPABASE_SERVICE_ROLE_KEY` never exposed client-side |
| Payments | ✅ | Price ID read server-side from env; webhook verified with `constructEvent`; idempotency handled |
| Authentication | ✅ | Session verified on every API route; `getCurrentUserId()` throws consistently |
| Ownership checks | ✅ | Chat and link ownership verified before all mutations |
| BYOK key storage | ✅ | AES-256-GCM with random IV and auth tag; `server-only` guard; key never returned in plaintext |
| SSRF | ✅ | `safeFetch` with IP blocklist, DNS pinning, redirect validation, and response size limits |
| CSP | ✅ | `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` |
| Entitlements | ✅ | All plan checks enforced server-side; no client-supplied plan data trusted |

---

## Fix Priority

1. **Fix IP extraction in rate limiter (Medium)** — actively exploitable, trivial to fix
2. **Pin Chrome extension ID (Medium)** — low likelihood but easy to lock down
3. **Add `X-Frame-Options` (Low)** — belt-and-suspenders for older browsers
4. **Add `hideSourceMaps: true` (Low)** — limits code exposure if Sentry upload config changes
