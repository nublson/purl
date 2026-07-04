# MCP OAuth 2.1 Support — Design

## Problem

Purl's MCP server (`/api/mcp`) authenticates only via a static `purl_...` Bearer API key (see [`docs/mcp-readiness.md`](../../mcp-readiness.md) and [`src/lib/mcp.ts`](../../../src/lib/mcp.ts)). This works for clients that let you paste a custom header (Cursor, VS Code, Codex, Claude Code CLI), but it breaks the one-click **"Connect"** flow in Claude Desktop and claude.ai.

Root cause: `mcp-handler`'s `withMcpAuth` always sends a `WWW-Authenticate: Bearer ... resource_metadata="<url>"` header on 401 — there's no way to suppress it. Spec-compliant MCP clients see that header and assume the server supports OAuth 2.1 discovery, then attempt Dynamic Client Registration (RFC 7591) against `<origin>/.well-known/oauth-protected-resource`. Purl has no such route, so registration 404s and Claude shows "Couldn't register with Purl's sign-in service."

**Goal:** implement OAuth 2.1 for the MCP endpoint so the native "Connect" button works, *without* removing the existing static API-key path (CLI/config-file users keep working exactly as they do today).

## Decisions

- **Dual auth, not a replacement.** `/api/mcp` accepts either a `purl_...` API key or an OAuth access token. Confirmed with the user explicitly.
- **Real consent screen**, not silent auto-approve. Confirmed with the user explicitly.
- **Connected Apps UI** lives in the existing Settings → Integrations tab, as a new section alongside the current API Keys list (not a separate tab).
- **Known gap, accepted:** Better Auth's consent screen only renders if the *connecting client's* authorize request includes `prompt=consent` — Purl cannot force this server-side without patching internal library behavior. Decision: ship with the default (`consentPage` configured, relying on the client to request it) and verify empirically against Claude Desktop / Claude Code once built. Revisit only if real clients don't request consent.

## Why Better Auth's `mcp` plugin (not hand-rolled OAuth)

Better Auth (already the auth system for the whole app, v1.6.14) ships an `mcp` plugin layered on its `oidc-provider` plugin. Confirmed by reading the installed package source (`node_modules/better-auth/dist/plugins/mcp/`):

- Implements RFC 7591 Dynamic Client Registration, RFC 8414 Authorization Server Metadata, RFC 9728 Protected Resource Metadata, PKCE, and JWKS already — this is the bulk of OAuth 2.1's complexity.
- Exports ready-made Next.js route handlers: `oAuthDiscoveryMetadata(auth)` and `oAuthProtectedResourceMetadata(auth)` — no custom metadata-serialization code needed.
- Exports `auth.api.getMcpSession({ headers })` — looks up an opaque bearer token against the `oauthAccessToken` table and returns the associated session/user, exactly the shape our existing `verifyToken` pattern needs.
- Provisions its own Prisma-backed tables (`oauthApplication`, `oauthAccessToken`, `oauthConsent`) via Better Auth's schema system, the same way the `apiKey` plugin added the `ApiKey` table.

Hand-rolling this (reinventing PKCE/JWKS/token rotation) was considered and rejected — meaningfully higher security risk for something auth-critical, for no real benefit over the library that's already in the stack.

## Architecture

```
Claude Desktop/claude.ai
   │  1. GET /.well-known/oauth-protected-resource
   │  2. GET /.well-known/oauth-authorization-server
   │  3. POST /api/auth/mcp/register           (DCR, no user involved)
   ▼
Purl (Next.js)
   │  4. GET /api/auth/mcp/authorize?client_id=...&code_challenge=...
   │     → no session? redirect to /login (original request stashed in signed cookie)
   │     → user logs in → Better Auth's own after-hook resumes the stashed authorize call
   │     → client requested prompt=consent? → redirect to /oauth/consent
   │  5. User approves on /oauth/consent → POST /api/auth/oauth2/consent
   │     → Better Auth issues an authorization code, redirects to Claude's redirect_uri
   │  6. Claude exchanges code: POST /api/auth/mcp/token → access_token + refresh_token
   ▼
Claude calls /api/mcp with `Authorization: Bearer <access_token>`
   → mcp-handler's withMcpAuth → our verifyToken() → auth.api.getMcpSession()
   → resolves userId → same MCP tools (search_content, save_link, list_saved_items, get_link)
```

The static API-key path is unchanged and runs in parallel: `Authorization: Bearer purl_...` → `auth.api.verifyApiKey()` → same tools.

## Components

### 1. `src/lib/auth.ts`
Add the `mcp` plugin alongside the existing `apiKey` plugin:
```ts
mcp({
  loginPage: "/login",
  oidcConfig: {
    consentPage: "/oauth/consent",
  },
})
```

### 2. Prisma schema + migration
Add `OauthApplication`, `OauthAccessToken`, `OauthConsent` models matching Better Auth's schema (`node_modules/better-auth/dist/plugins/oidc-provider/schema.mjs`), following the same convention as the existing `ApiKey` model/migration (`prisma/migrations/20260603000000_add_api_keys`).

### 3. Root `.well-known` routes
Two new files, each a one-liner delegating to Better Auth's exported handlers:
- `src/app/.well-known/oauth-authorization-server/route.ts` → `export const GET = oAuthDiscoveryMetadata(auth);`
- `src/app/.well-known/oauth-protected-resource/route.ts` → `export const GET = oAuthProtectedResourceMetadata(auth);`

These must live at the domain root (not under `/api/auth`) because OAuth discovery convention requires it, and `mcp-handler`'s `withMcpAuth` already points its `WWW-Authenticate` header at `${origin}/.well-known/oauth-protected-resource` by default.

### 4. Consent page — `src/app/(public)/oauth/consent/page.tsx`
Reads `consent_code`, `client_id`, `scope` from the query string, looks up the client's display name, and shows an "Authorize `<client_name>` to access your Purl account? Allow / Deny" screen. Submits the decision via `POST /api/auth/oauth2/consent` with `{ accept, consent_code }`.

### 5. `src/lib/mcp.ts` — `verifyToken`
Extend the existing function to try both auth methods:
1. `auth.api.verifyApiKey({ body: { key: bearerToken }, headers })` — existing path, unchanged.
2. If that fails, `auth.api.getMcpSession({ headers, asResponse: false })` — new OAuth path. Explicitly check `accessTokenExpiresAt > now` ourselves as defense-in-depth (the installed version's endpoint does a raw `findOne` without visibly filtering expiry in the code path we read).
3. Either path populates the same `AuthInfo` shape (`{ token, clientId, scopes: [], extra: { userId } }`) already consumed by `registerPurlTools`.

### 6. `src/proxy.ts`
Add a bypass for the new root `.well-known/*` paths (not covered by the existing `/api/auth` prefix bypass) and for `/oauth/consent` (needs a real Purl session, but isn't part of the normal private-route gate).

### 7. Settings — Connected Apps
New section in `src/components/settings-integrations.tsx`, mirroring the existing API Keys list/revoke UI pattern (`SettingsItem` header, list of rows, `AlertDialog`-confirmed revoke). Backed by new endpoint(s) that:
- List: query `oauthConsent`/`oauthAccessToken` joined with `oauthApplication`, scoped to the current `userId`.
- Revoke: delete the access/refresh token rows (and consent record) for that client + user.

## Data flow

**OAuth "Connect" (new):** described in the Architecture diagram above.

**Existing API-key flow:** entirely unchanged — CLI/config-file users keep pasting a `purl_...` Bearer token.

**Revocation:** Settings → Integrations → Connected Apps → Revoke → deletes that client's token rows for the user → next MCP call from that client gets 401, identical to an expired session.

## Error handling

- Invalid/expired/missing OAuth token → 401, same response shape as an invalid API key (no client-visible difference between the two auth methods failing).
- `verifyToken` wraps `getMcpSession` in the same try/catch pattern already used for `verifyApiKey` — never throws; falls through to "unauthorized."
- User denies consent → Better Auth redirects to the client's `redirect_uri` with `error=access_denied` (standard OAuth, no custom code).
- Revoking a still-unexpired token: since revocation deletes the DB row, the next `getMcpSession` lookup returns null — same as a missing token. Revocation is immediate, not just at natural expiry.
- Refresh-token exchange (`grant_type=refresh_token` at `/mcp/token`) is handled entirely by Better Auth's built-in token endpoint.
- Rate limiting: `/api/auth/mcp/*` and `/api/auth/oauth2/*` already fall under the existing `/api/auth` prefix limiter in `src/lib/proxy-rate-limit.ts` — no new limiter needed. The two root `.well-known/*` routes are cheap, read-only, unauthenticated metadata (same risk profile as `/docs/*`) — no dedicated limiter.

## Testing

- Extend `src/lib/mcp.test.ts`: valid OAuth token resolves the correct `userId`; expired OAuth token rejected; both API key and OAuth token invalid → 401; existing API-key tests continue passing unchanged (regression).
- New tests for the Connected Apps list/revoke endpoint(s), mirroring `src/app/api/v1/keys/route.test.ts` (mock Prisma, assert ownership scoping — one user can't see or revoke another user's connected apps).
- `src/proxy.test.ts`: bypass coverage for the new root `.well-known/*` paths.
- **Manual verification (not automatable in Vitest):** full browser OAuth round-trip against Claude Desktop and Claude Code, specifically checking the login-resumption behavior noted below, and whether the consent screen actually renders in practice.

## Known risks to verify during implementation

1. **Login-resumption interaction.** Better Auth's `mcp` plugin has a built-in "resume OAuth flow after login" mechanism: a signed `oidc_login_prompt` cookie plus a global `after`-hook that re-runs the authorize step once a session cookie appears in the response. Purl has a **custom** login page (`src/app/(public)/login/page.tsx`, via `src/hooks/use-auth.ts`'s `signInWithEmail`), not Better Auth's hosted UI, and the current post-login behavior is a hardcoded client-side `router.replace("/home")` — it does not check for a pending OAuth resumption. There's a real chance the automatic hook doesn't resume cleanly through a client-side XHR-based sign-in versus a full page navigation. **Fallback if it doesn't work out of the box:** after sign-in success, detect the pending-resumption cookie/query and force a full page navigation instead of a client-side route change, so Better Auth's hook has the original request context it expects.
2. **Consent screen may not always render**, per the accepted decision above — depends on whether the connecting client sends `prompt=consent`. Verify against real clients; revisit only if it doesn't show up in practice for Claude Desktop/Claude Code.
