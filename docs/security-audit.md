# Security Audit

Audited on 2026-05-28 against the `feature/byok` branch.

---

## Medium

### ~~`src/lib/proxy-rate-limit.ts` — IP spoofing bypasses rate limits~~ (withdrawn)

**Status: not applicable on Vercel. Re-checked 2026-10-02.**

The original finding said `clientIp` reads the client-controlled first entry of `x-forwarded-for`, so a client could send `x-forwarded-for: 1.2.3.4` to get a fresh rate-limit bucket on every request. That's true behind proxies that append to the header, but not on Vercel. Vercel overwrites `x-forwarded-for` and does not forward client-supplied IPs ([Vercel request headers](https://vercel.com/docs/headers/request-headers)). On a direct Vercel deployment, the first (and only) entry is the connecting client's public IP, so it is a sound rate-limit key and no change is needed.

**Revisit if** another proxy or CDN that appends to `x-forwarded-for` (Cloudflare, an Enterprise trusted proxy, a self-hosted load balancer) is ever put in front of the app. In that case, key on the entry that proxy appends, or on its own client-IP header, instead of the first entry.

Related: username changes are now rate-limited per user after authentication (`src/app/api/user/username/route.ts`), not per IP.

---

### ~~`src/app/api/links/route.ts` — Any Chrome extension can make credentialed requests~~ (fixed)

**Status: fixed 2026-10-02.** `POST /api/links` no longer allows every `chrome-extension://` origin. Credentialed CORS is limited to origins listed in `ALLOWED_ORIGINS`. Purl's own extension needs no CORS headers: it calls the API from its service worker with `host_permissions` for `https://purl.live/*`, which Chrome exempts from the same-origin policy ([Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)). To allow a specific extension anyway, add its `chrome-extension://<id>` origin to `ALLOWED_ORIGINS`. An extension that has its own host permission for the app isn't limited by CORS, so no server-side CORS setting can block it.

The original finding, kept for reference:

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

### ~~`next.config.ts` — `X-Frame-Options` header missing~~ (fixed)

**Status: fixed 2026-10-02.** `X-Frame-Options: DENY` is in `BASE_SECURITY_HEADERS`, so it's sent in dev and production next to the CSP's `frame-ancestors 'none'` (verified on a production build for `/`, `/home` and `/api/links`). The original finding, kept for reference:

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

### ~~`next.config.ts` — Source maps may be exposed in production~~ (resolved)

**Status: resolved 2026-10-02.** Sentry has since been removed (no `withSentryConfig`, no dependency), and Next.js doesn't emit browser source maps in production builds. `productionBrowserSourceMaps: false` is now set explicitly in `next.config.ts` to document that, and a production build was checked to emit no `.map` files in `.next/static` or `public/`. The original finding, kept for reference:

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

All findings are fixed, resolved or withdrawn (2026-10-02):

- ~~Fix IP extraction in rate limiter~~ — withdrawn: Vercel overwrites `x-forwarded-for`, so it isn't spoofable on this deployment.
- ~~Pin Chrome extension ID~~ — fixed: extension origins need an explicit `ALLOWED_ORIGINS` entry.
- ~~Add `X-Frame-Options`~~ — fixed: `X-Frame-Options: DENY` on every response.
- ~~Add `hideSourceMaps: true`~~ — resolved: Sentry is gone and no browser source maps are emitted.
