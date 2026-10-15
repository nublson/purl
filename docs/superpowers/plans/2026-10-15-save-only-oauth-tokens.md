# Save-only OAuth tokens for the portfolio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let nublson.com run browser-side OAuth (authorization code + PKCE, public client) against Purl and save links into a visitor's library with a token that can do nothing else.

**Architecture:** Reuse the existing Better Auth `mcp` plugin for authorize/token/refresh. Add a `links:save` scope, a Bearer-only `POST /api/v1/links/save`, and a denylist in the MCP auth path so a save token never reaches the MCP tools. A small wrapper in the `/api/auth` route adds token-endpoint CORS and server-side guards for `links:save` authorize requests (forced consent, required S256 PKCE). The portfolio client is registered by a migration.

**Tech Stack:** Next.js App Router, Better Auth 1.6.22 (`mcp` plugin), Prisma/Postgres, Vitest.

**Spec:** `/Users/nublson/Downloads/2026-10-15-purl-side-save-from-portfolio.md`

## Findings from reading the code (they change the plan vs. the spec)

1. **Consent is skipped by default.** `authorizeMCPOAuth` (node_modules/better-auth/dist/plugins/mcp/authorize.mjs) redirects straight to the callback with a code unless the request has `prompt=consent`. The portfolio's authorize URL (spec table) has no `prompt`, so a signed-in visitor would be granted a token with **no consent screen**, defeating spec §5. Fix server-side (Task 5), do not rely on the portfolio.
2. **PKCE is not enforced.** `requirePKCE` is off; a public client's token request only checks the verifier if the code was issued with a challenge. For `links:save` we require an S256 challenge at authorize (Task 5). Global `requirePKCE: true` is deliberately not used: it could break existing MCP clients.
3. **Refresh does not rotate/invalidate.** The refresh grant inserts a new token row and leaves the old access and refresh tokens valid (no reuse detection). Answer to the open question: two portfolio tabs refreshing at once cannot invalidate each other. Revocation (`revokeConnectedApp`) deletes all rows for the client+user, so it still works.
4. **Registration scopes:** the `mcp` plugin accepts only scopes in `oidcConfig.scopes`; unknown scopes are rejected at authorize with `invalid_scope`.
5. `getMcpSession` reads only the `Authorization` header, so the new route cannot be reached with a cookie. API keys (`purl_…`) find no `oauthAccessToken` row and give 401.
6. Open dynamic registration (`/api/auth/mcp/register`) stays open — out of scope; note separately.

## Global Constraints

- Scope string: exactly `links:save` (plus `offline_access` for refresh).
- Missing-scope response: `403 { error, code: "insufficient_scope" }`; link limit: `403 { error, code: "LIMIT_REACHED", feature }`; the two codes must differ.
- Save route is Bearer-only: no cookie sessions, no API keys.
- Token endpoint CORS: allowlist from env `OAUTH_CORS_ORIGINS` (comma-separated), never `*`, token endpoint only, `Allow-Headers: Content-Type`, `Allow-Methods: POST, OPTIONS`, no `Allow-Credentials`.
- Existing MCP clients (tokens without `links:save`) must keep working unchanged.
- Migration must be additive (release gate).
- Redirect URLs registered exactly: `https://nublson.com/purl/callback,http://localhost:3000/purl/callback` (**confirm the production origin with the owner before merging**; it is the one spec open question that blocks the migration).
- Client id: `nublson-com` (given to the portfolio as `NEXT_PUBLIC_PURL_CLIENT_ID`), type `public`, name `nublson.com`.

## Review Focus

- Token with `links:save` **plus** other scopes (e.g. `openid links:save`) must still be rejected by MCP. (Task 2)
- Token with expired `accessTokenExpiresAt` or malformed timestamp on the save route → 401, not 500. (Task 3)
- Empty/oversized/non-JSON body on save → 400, never 500. (Task 3)
- Authorize for `links:save` without `code_challenge` / with `plain` → rejected; the request is not redirected to an unvalidated `redirect_uri`. (Task 5)
- Unknown `Origin` on the token endpoint gets no `Access-Control-Allow-Origin`; `OAUTH_CORS_ORIGINS` unset → no origin allowed. (Task 5)

---

### Task 1: `links:save` scope and honest consent text

**Files:**
- Modify: `src/lib/oauth-scopes.ts`
- Test: `src/lib/oauth-scopes.test.ts`

**Interfaces:**
- Produces: `export const SAVE_SCOPE = "links:save"`; `describeAccess(scopes)` unchanged signature.

- [ ] **Step 1: Write failing tests** in `oauth-scopes.test.ts`:
  - `describeAccess(["links:save","offline_access"])` equals `["Save links to your library","Stay connected until you disconnect it"]`.
  - `describeAccess(["openid","links:save"])` contains `"Know your name and email"` and `"Save links to your library"`, and none of the three `PURL_ACCESS` lines.
  - existing tests for sets without `links:save` stay as they are.
- [ ] **Step 2:** Run `pnpm vitest run src/lib/oauth-scopes.test.ts`; expect the new tests FAIL.
- [ ] **Step 3: Implement** in `oauth-scopes.ts`: export `SAVE_SCOPE`; add `"links:save"` to `KNOWN_SCOPES`; when the requested scopes include it, the base list is `["Save links to your library"]` instead of `PURL_ACCESS` (truthful because Task 2 confines these tokens to saving). Update the `PURL_ACCESS` doc comment.
- [ ] **Step 4:** Re-run the test file; expect PASS.
- [ ] **Step 5: Commit** `feat: links:save scope and its consent wording`

### Task 2: Keep save-only tokens out of MCP

**Files:**
- Modify: `src/lib/mcp.ts` (`verifyOAuthToken`)
- Test: `src/lib/mcp.test.ts` (existing `verifyToken` describe block, mocks `getMcpSession`)

**Interfaces:**
- Consumes: `SAVE_SCOPE` from Task 1.
- Produces: `export async function readOAuthSession(req: Request): Promise<AuthInfo | undefined>` — the current body of `verifyOAuthToken` (getMcpSession + expiry check, no scope policy). `verifyOAuthToken` becomes `readOAuthSession` plus "return undefined when `scopes` includes `SAVE_SCOPE`".

- [ ] **Step 1: Failing tests** in `mcp.test.ts`: `verifyToken` returns `undefined` for a session with scopes `"links:save offline_access"` and for `"openid links:save"`; still returns info for `"openid offline_access"` and for empty scopes (existing tests).
- [ ] **Step 2:** Run `pnpm vitest run src/lib/mcp.test.ts`; expect the two new tests FAIL.
- [ ] **Step 3: Implement** the split above in `mcp.ts`; keep the expiry comment on `readOAuthSession`.
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5: Commit** `feat: MCP rejects save-only OAuth tokens`

### Task 3: `POST /api/v1/links/save`

**Files:**
- Create: `src/app/api/v1/links/save/route.ts`
- Test: `src/app/api/v1/links/save/route.test.ts` (mirror the mocking style of `src/app/api/v1/links/route.test.ts`; mock `@/lib/mcp` `readOAuthSession` and `@/lib/links` `createLinkForUser`)

**Interfaces:**
- Consumes: `readOAuthSession` (Task 2), `SAVE_SCOPE`, `createLinkForUser(userId, url)`, `SaveLimitError`, `serializeLink`, `broadcastLinksChanged`, `addCors`, `corsPreflightResponse`, `isValidUrl`.
- Produces: `export async function OPTIONS(): Promise<Response>`, `export async function POST(request: NextRequest): Promise<NextResponse>`.

- [ ] **Step 1: Failing tests** (names → assertions):
  - `201 on success` → body has the serialized link and `moved`; `createLinkForUser` called with `("user-1", "https://example.com/post")`; `broadcastLinksChanged("user-1")` called.
  - `401 without bearer / garbage token` (`readOAuthSession` → undefined) → 401 `{error:"Unauthorized"}`, `createLinkForUser` not called.
  - `401 for an expired token` — covered by `readOAuthSession` returning undefined; plus one test in `mcp.test.ts` already exists for expiry (reuse, do not duplicate).
  - `403 insufficient_scope` for scopes `["openid"]` → `{code:"insufficient_scope"}`.
  - `403 LIMIT_REACHED` when `createLinkForUser` throws `SaveLimitError` → `{code:"LIMIT_REACHED", feature:"SAVE_LIMIT"}`.
  - `400` for invalid URL, empty body, and non-JSON body.
  - `401 for a cookie-only request` (no Authorization header, cookie present) → 401.
  - `OPTIONS` → 204 with `Access-Control-Allow-Headers` containing `Authorization`.
- [ ] **Step 2:** Run the file; expect FAIL (module missing).
- [ ] **Step 3: Implement** the route: read `Authorization` via `readOAuthSession(request)` (it reads headers only); 401 if undefined; 403 `insufficient_scope` unless `scopes` includes `SAVE_SCOPE`; parse JSON like `src/app/api/v1/links/route.ts` POST (no `folderId`); map errors as that route (`SaveLimitError` → 403 `LIMIT_REACHED`); every response through `addCors`.
- [ ] **Step 4:** Run the file; expect PASS.
- [ ] **Step 5: Commit** `feat: POST /api/v1/links/save for save-only OAuth tokens`

### Task 4: Register the scope with the plugin and discovery

**Files:**
- Modify: `src/lib/auth.ts` (`mcp({ oidcConfig })`)
- Test: `src/app/.well-known/oauth-discovery.test.ts`

- [ ] **Step 1: Failing test** in `oauth-discovery.test.ts`: both discovery documents' `scopes_supported` include `"links:save"` (and `"offline_access"`).
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3: Implement** in `auth.ts`: `oidcConfig.scopes: [SAVE_SCOPE]` (authorize/token accept it) and advertise it: `oidcConfig.metadata.scopes_supported` feeds the protected-resource document; for the authorization-server document use whichever `mcp()` option the installed version reads (`getMCPProviderMetadata` spreads `options.metadata`). If the type doesn't allow it, set it in `src/app/.well-known/oauth-authorization-server/route.ts` by patching the JSON before `withCdnCache`. Keep the documents host-independent (existing test).
- [ ] **Step 4:** Run `pnpm vitest run src/app/.well-known src/lib/auth.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat: advertise and accept the links:save scope`

### Task 5: `/api/auth` wrapper — token CORS, forced consent, required PKCE

**Files:**
- Create: `src/lib/oauth-route.ts`
- Modify: `src/app/api/auth/[...all]/route.ts`
- Test: `src/lib/oauth-route.test.ts`

**Interfaces:**
- Produces:
  - `export function oauthCorsOrigin(origin: string | null, env?: string): string | null` — the origin when it is in the comma-separated `OAUTH_CORS_ORIGINS` list (exact match, trimmed), else null.
  - `export function tokenPreflight(request: Request): Response` — 204 with `Allow-Origin` (if allowed), `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`, `Vary: Origin`.
  - `export function withTokenCors(request: Request, response: Response): Response` — adds `Allow-Origin` + `Vary: Origin` when allowed.
  - `export function guardSaveAuthorize(request: Request): Request | Response` — for `GET …/mcp/authorize` whose `scope` includes `SAVE_SCOPE`: returns a 400 JSON `{error:"invalid_request", error_description}` unless `code_challenge` is present and `code_challenge_method` is `S256` (case-insensitive); otherwise returns a copy of the request with `prompt=consent` set. Any other request is returned untouched.
- Route: export `GET` (through `guardSaveAuthorize`), `POST` (wrap with `withTokenCors` only when path ends `/mcp/token`), `OPTIONS` (`tokenPreflight` for `/mcp/token`, 404/204 elsewhere), keep `PATCH/PUT/DELETE` as the handler's.

- [ ] **Step 1: Failing tests** in `oauth-route.test.ts`:
  - `oauthCorsOrigin("https://nublson.com", "https://nublson.com,http://localhost:3000")` → that origin; unknown origin → null; env unset/empty → null; `*` in the list never matches anything but the literal.
  - `tokenPreflight` for an allowed origin has the three headers and no `Access-Control-Allow-Credentials`; for an unknown origin has no `Allow-Origin`.
  - `withTokenCors` echoes only allowed origins.
  - `guardSaveAuthorize`: save scope without challenge → 400; with `plain` → 400; with S256 → request whose URL has `prompt=consent` (even if the caller sent `prompt=none`); non-save scope request → same object, query unchanged.
- [ ] **Step 2:** Run the file; expect FAIL.
- [ ] **Step 3: Implement** `oauth-route.ts` and wire the route handler (`toNextJsHandler(auth)` returns `{GET, POST, ...}`; wrap them). Add `OAUTH_CORS_ORIGINS` to `.env.example` with a comment.
- [ ] **Step 4:** Run the file plus `pnpm vitest run src/lib`; expect PASS.
- [ ] **Step 5: Commit** `feat: token-endpoint CORS and guarded authorize for links:save`

### Task 6: Register the nublson.com client

**Files:**
- Create: `prisma/migrations/20261015120000_register_nublson_oauth_client/migration.sql`

- [ ] **Step 1:** Write the migration: one `INSERT INTO "oauthApplication" ("id","name","clientId","clientSecret","redirectUrls","type","disabled","createdAt","updatedAt") VALUES ('nublson-com','nublson.com','nublson-com',NULL,'https://nublson.com/purl/callback,http://localhost:3000/purl/callback','public',false,NOW(),NOW()) ON CONFLICT ("clientId") DO NOTHING;` (additive; no DDL).
- [ ] **Step 2:** `DATABASE_URL=… pnpm prisma migrate deploy` against local Docker Postgres; check the row with `psql`; then the drift check from CLAUDE.md (`pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`) — expect no diff.
- [ ] **Step 3: Commit** `feat: register the nublson.com OAuth client`

### Task 7: End-to-end proof and docs

**Files:**
- Modify: `CLAUDE.md` (a short paragraph under Authentication & routing: save-only tokens, the four guards), optionally `src/app/.well-known/mcp/server-card.json` untouched.

- [ ] **Step 1: Resume-after-sign-in (spec §7).** Local `pnpm dev`; signed out, open `/api/auth/mcp/authorize?response_type=code&client_id=nublson-com&redirect_uri=http://localhost:3000/purl/callback&scope=links:save offline_access&state=abc&code_challenge=<S256>&code_challenge_method=S256`; sign in with GitHub/Google (also a brand-new account). Expect: lands on `/oauth/consent` showing only "Save links to your library" and "Stay connected until you disconnect it"; Allow redirects to the callback with `code` and `state=abc`. If sign-in drops the request, fix in `src/lib/auth-hooks.ts`/the sign-in callback (only then).
- [ ] **Step 2: Token + save with curl** (browser-origin header): exchange the code (`Origin: http://localhost:3000` must be echoed in `Access-Control-Allow-Origin`; `Origin: https://evil.example` must not); `POST /api/v1/links/save` with the token → 201.
- [ ] **Step 3: Isolation.** With the same token: `GET /api/v1/links` → 401; MCP `tools/list` at `/api/mcp` → 401.
- [ ] **Step 4: Refresh and revoke.** Refresh grant with `client_id` only → new tokens; revoke from Settings → Connected apps; next save → 401.
- [ ] **Step 5: Deny** at the consent screen returns `error=access_denied` to the callback. Run `pnpm lint && pnpm typecheck && pnpm test`; expect all green.
- [ ] **Step 6: Commit** `docs: save-only OAuth tokens`

## Self-review notes

- Spec §1 → Task 6 (+ Task 5's PKCE guard); §2 → Tasks 1, 4; §3 → Task 3; §4 → Task 2 (+ Task 7 step 3 for `GET /api/v1/links`, which resolves cookie/API-key sessions only; an unrelated test would only mock that away); §5 → Tasks 1, 5 (forced consent); §6 → Task 5; §7 → Task 7; §8 → Task 7 step 4 (existing `revokeConnectedApp`).
- Rate limiting (spec §3): `/api/v1/*` already rate limits; a non-API-key bearer fails `getSession` and is bucketed by the raw token (see `resolveBearerRateLimitKey`). Acceptable; no change.
- Out of scope, to note separately: open dynamic client registration; no refresh-token reuse detection (see finding 3).
