# MCP OAuth 2.1 Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude Desktop/claude.ai's one-click "Connect" button authenticate to Purl's MCP server via OAuth 2.1, while the existing static `purl_...` API-key Bearer auth keeps working unchanged for CLI/config-file users.

**Architecture:** Add Better Auth's `mcp` plugin (built on its `oidc-provider` plugin) to `src/lib/auth.ts`. It provisions its own DB tables and exposes ready-made handlers for OAuth discovery, dynamic client registration, authorize/consent, and token exchange. `src/lib/mcp.ts`'s `verifyToken` tries the existing API-key check first, then falls back to `auth.api.getMcpSession()` for OAuth tokens. A new Settings → Integrations → "Connected Apps" section lets users see and revoke OAuth-connected clients.

**Tech Stack:** Better Auth 1.6.14 (`mcp` + `oidc-provider` plugins), Prisma/Postgres, Next.js App Router, `mcp-handler` (unchanged), Vitest.

**Full design reference:** [`docs/superpowers/specs/2026-07-04-mcp-oauth-design.md`](../specs/2026-07-04-mcp-oauth-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `OauthApplication`, `OauthAccessToken`, `OauthConsent` models |
| `prisma/migrations/<generated>/migration.sql` | Create (generated) | DB migration for the three new tables |
| `src/lib/auth.ts` | Modify | Register the `mcp` plugin |
| `src/app/.well-known/oauth-authorization-server/route.ts` | Create | Root-level OAuth AS metadata (RFC 8414) |
| `src/app/.well-known/oauth-protected-resource/route.ts` | Create | Root-level protected resource metadata (RFC 9728) |
| `src/proxy.ts` | Modify | Bypass session-redirect for the two `.well-known/*` routes |
| `src/proxy.test.ts` | Modify | Cover the new bypass |
| `src/lib/mcp.ts` | Modify | `verifyToken` tries API key, then OAuth session |
| `src/lib/mcp.test.ts` | Modify | Cover the OAuth fallback path |
| `src/lib/connected-apps.ts` | Create | List/revoke OAuth-connected apps for a user |
| `src/lib/connected-apps.test.ts` | Create | Unit tests for the above |
| `src/app/api/user/connected-apps/route.ts` | Create | `GET` — list connected apps |
| `src/app/api/user/connected-apps/route.test.ts` | Create | Route test |
| `src/app/api/user/connected-apps/[clientId]/route.ts` | Create | `DELETE` — revoke a connected app |
| `src/app/api/user/connected-apps/[clientId]/route.test.ts` | Create | Route test |
| `src/components/settings-integrations.tsx` | Modify | Add "Connected Apps" section |
| `src/app/oauth/consent/page.tsx` | Create | Consent screen (server component, fetches client name via Prisma) |
| `src/components/oauth-consent-actions.tsx` | Create | Client component — Allow/Deny buttons, posts the decision |

---

### Task 1: Prisma schema and migration for OAuth tables

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append the three new models to `prisma/schema.prisma`**

Add this after the existing `model Apikey { ... }` block (currently the last model in the file, ending at line 257):

```prisma
model OauthApplication {
  id           String    @id
  name         String
  icon         String?
  metadata     String?
  clientId     String    @unique
  clientSecret String?
  redirectUrls String
  type         String
  disabled     Boolean?  @default(false)
  userId       String?
  createdAt    DateTime
  updatedAt    DateTime

  @@index([userId])
  @@map("oauthApplication")
}

model OauthAccessToken {
  id                    String   @id
  accessToken           String   @unique
  refreshToken          String   @unique
  accessTokenExpiresAt  DateTime
  refreshTokenExpiresAt DateTime
  clientId              String
  userId                String?
  scopes                String
  createdAt             DateTime
  updatedAt             DateTime

  @@index([clientId])
  @@index([userId])
  @@map("oauthAccessToken")
}

model OauthConsent {
  id           String   @id
  clientId     String
  userId       String
  scopes       String
  createdAt    DateTime
  updatedAt    DateTime
  consentGiven Boolean

  @@index([clientId])
  @@index([userId])
  @@map("oauthConsent")
}
```

This mirrors the existing `Apikey` model's style exactly: no Prisma-level `@relation` fields (Better Auth's adapter queries these tables directly; the existing `Apikey` model follows the same plain-field-plus-index convention rather than declaring relations).

- [ ] **Step 2: Generate the migration**

Run:
```bash
pnpm prisma migrate dev --name add_mcp_oauth_support
```

Expected output: Prisma detects the three new models, creates a new directory under `prisma/migrations/<timestamp>_add_mcp_oauth_support/` containing `migration.sql` with three `CREATE TABLE` statements (for `oauthApplication`, `oauthAccessToken`, `oauthConsent`) plus their indexes, applies it to your local dev database, and regenerates the Prisma Client at `src/generated/prisma`. It should print `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify the generated client has the new models**

This project's Prisma generator (v7) emits one file per model under `src/generated/prisma/models/`, re-exported from `models.ts` — check the new models landed there:
```bash
ls src/generated/prisma/models/ | grep -i oauth
grep -n "Oauth" src/generated/prisma/models.ts
```
Expected: `OauthApplication.ts`, `OauthAccessToken.ts`, `OauthConsent.ts` listed, and three matching `export type * from './models/Oauth...'` lines in `models.ts`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add OAuth application/token/consent tables for MCP OAuth"
```

---

### Task 2: Register the `mcp` plugin in Better Auth

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add the plugin**

In `src/lib/auth.ts`, update the import and `plugins` array:

```ts
import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "@better-auth/api-key";
import prisma from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import { createTrialSubscription } from "@/lib/subscription-utils";

export const auth = betterAuth({
  plugins: [
    apiKey({
      enableSessionForAPIKeys: true,
      defaultPrefix: "purl_",
      // Per-key rate limiting defaults to 10 requests/day, which is far too low
      // for the MCP server (every request re-validates the key) and the REST
      // API. Abuse protection is handled at the proxy layer (Upstash).
      rateLimit: {
        enabled: false,
      },
      customAPIKeyGetter: (ctx) => {
        // Extract token from "Authorization: Bearer purl_..." header
        // GenericEndpointContext is a Better Auth internal type — cast via unknown
        type CtxLike = {
          request?: { headers?: { get?: (k: string) => string | null } };
          headers?: { get?: (k: string) => string | null };
        };
        const c = ctx as unknown as CtxLike;
        const authHeader =
          c.request?.headers?.get?.("authorization") ??
          c.headers?.get?.("authorization") ??
          null;
        if (typeof authHeader !== "string") return null;
        if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) return null;
        return authHeader.slice(7);
      },
    }),
    mcp({
      loginPage: "/login",
      oidcConfig: {
        consentPage: "/oauth/consent",
      },
    }),
  ],
  // ...rest of the file unchanged
```

Leave everything else in the file (`databaseHooks`, `database`, `user`, `session`, `emailAndPassword`, `emailVerification`) exactly as it is.

- [ ] **Step 2: Regenerate the Prisma client is not needed here (already done in Task 1), but confirm the app builds**

Run:
```bash
pnpm typecheck
```
Expected: no errors. This confirms `auth.api.getMcpSession`, `auth.api.getMCPProtectedResource`, and `auth.api.getMcpOAuthConfig` are now typed (Better Auth's plugin type-registry merge picks them up automatically from the `mcp` plugin, the same mechanism that already exposes `auth.api.verifyApiKey`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): register Better Auth's mcp plugin for OAuth 2.1 support"
```

---

### Task 3: Root-level `.well-known` OAuth discovery routes

**Files:**
- Create: `src/app/.well-known/oauth-authorization-server/route.ts`
- Create: `src/app/.well-known/oauth-protected-resource/route.ts`

- [ ] **Step 1: Create the authorization-server metadata route**

`src/app/.well-known/oauth-authorization-server/route.ts`:
```ts
import { auth } from "@/lib/auth";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

export const GET = oAuthDiscoveryMetadata(auth);
```

- [ ] **Step 2: Create the protected-resource metadata route**

`src/app/.well-known/oauth-protected-resource/route.ts`:
```ts
import { auth } from "@/lib/auth";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

export const GET = oAuthProtectedResourceMetadata(auth);
```

Both handlers are exported directly from Better Auth's `mcp` plugin module — they call `auth.api.getMcpOAuthConfig(...)` / `auth.api.getMCPProtectedResource(...)` internally and already set the correct CORS headers, so no custom logic is needed here.

These must live at the true domain root (`/.well-known/...`), not under `/api/auth`, because `mcp-handler`'s `withMcpAuth` (already wired up in `src/app/api/[transport]/route.ts`) sends `WWW-Authenticate: Bearer ... resource_metadata="<origin>/.well-known/oauth-protected-resource"` on 401 by default — that URL must resolve.

- [ ] **Step 3: Verify locally**

Start the dev server (`pnpm dev`) and run:
```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource | jq .
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq .
```
Expected: both return JSON (not a 404 or HTML error page). The protected-resource response should include `"authorization_servers"` pointing at your origin; the authorization-server response should include `"authorization_endpoint"`, `"token_endpoint"`, and `"registration_endpoint"` all pointing at `<origin>/api/auth/mcp/...`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/.well-known"
git commit -m "feat(mcp): add root .well-known OAuth discovery routes"
```

---

### Task 4: Proxy bypass for the new `.well-known` routes

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/proxy.test.ts`

Note: `/oauth/consent` (added in Task 9) needs **no** proxy change — it's not in `publicRoutes`, so it already falls through to the default "require a session, redirect to `/login` if missing" behavior, which is exactly what a consent screen needs. Only the two unauthenticated `.well-known` metadata routes need an explicit bypass.

- [ ] **Step 1: Write the failing tests**

In `src/proxy.test.ts`, add this new `describe` block right before the closing `});` of the outer `describe("proxy", ...)` block (after the existing `describe("API v1 routes", ...)` block):

```ts
  describe(".well-known OAuth discovery routes", () => {
    it("returns next for oauth-protected-resource without a session lookup", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const req = createRequest("/.well-known/oauth-protected-resource");
      const res = await proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(auth.auth.api.getSession).not.toHaveBeenCalled();
    });

    it("returns next for oauth-authorization-server without a session lookup", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const req = createRequest("/.well-known/oauth-authorization-server");
      const res = await proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(auth.auth.api.getSession).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm vitest run src/proxy.test.ts
```
Expected: FAIL — both new tests redirect to `/login` (307) instead of returning 200, because `/.well-known/*` isn't in `publicRoutes` yet.

- [ ] **Step 3: Add the bypass in `src/proxy.ts`**

In the `publicRoutes` array (currently ending with the `/api/auth` prefix entry), add a new entry:

```ts
const publicRoutes: PublicRoute[] = [
  { path: "/", whenAuthenticated: "next" },
  { path: "/login", whenAuthenticated: "redirect" },
  { path: "/signup", whenAuthenticated: "redirect" },
  { path: "/privacy", whenAuthenticated: "next" },
  { path: "/terms", whenAuthenticated: "next" },
  { path: "/docs", match: "prefix", whenAuthenticated: "next" },
  {
    path: "/.well-known",
    match: "prefix",
    whenAuthenticated: "next",
    skipSessionLookup: true,
  },
  {
    path: "/api/auth",
    match: "prefix",
    whenAuthenticated: "next",
    skipSessionLookup: true,
  },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run src/proxy.test.ts
```
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts
git commit -m "feat(proxy): bypass session redirect for .well-known OAuth routes"
```

---

### Task 5: Dual auth in `verifyToken` (API key + OAuth)

**Files:**
- Modify: `src/lib/mcp.ts`
- Modify: `src/lib/mcp.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/mcp.test.ts`, update the `@/lib/auth` mock to include `getMcpSession`:

```ts
const mockVerifyApiKey = vi.fn();
const mockGetMcpSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { verifyApiKey: mockVerifyApiKey, getMcpSession: mockGetMcpSession } },
}));
```

Then add these test cases inside the existing `describe("verifyToken", ...)` block, after the last existing `it(...)`:

```ts
  it("does not call getMcpSession when the API key is valid", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: "key-1", referenceId: "user-1" },
    });
    await verifyToken(reqWithBearer("purl_x"), "purl_x");
    expect(mockGetMcpSession).not.toHaveBeenCalled();
  });

  it("falls back to an OAuth session when the key is not a valid API key", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "oauth-token-1",
      clientId: "client-1",
      userId: "user-2",
      scopes: "openid profile",
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const info = await verifyToken(reqWithBearer("oauth-token-1"), "oauth-token-1");
    expect(info).toMatchObject({
      token: "oauth-token-1",
      clientId: "client-1",
      scopes: ["openid", "profile"],
      extra: { userId: "user-2" },
    });
  });

  it("returns undefined when no OAuth session is found", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue(null);
    expect(await verifyToken(reqWithBearer("bad"), "bad")).toBeUndefined();
  });

  it("returns undefined when the OAuth access token is expired", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "expired-token",
      clientId: "client-1",
      userId: "user-2",
      scopes: "openid",
      accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(
      await verifyToken(reqWithBearer("expired-token"), "expired-token"),
    ).toBeUndefined();
  });

  it("returns undefined when getMcpSession throws", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockRejectedValue(new Error("network error"));
    expect(await verifyToken(reqWithBearer("bad"), "bad")).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm vitest run src/lib/mcp.test.ts
```
Expected: FAIL on the four new tests — `verifyToken` doesn't call `getMcpSession` at all yet, so the fallback tests get `undefined` when they expect populated `AuthInfo`, and the "does not call" test currently passes trivially (that one won't fail, which is fine — it's a regression guard for after the change).

- [ ] **Step 3: Implement the dual-auth `verifyToken`**

In `src/lib/mcp.ts`, replace the existing `verifyToken` function (currently the last export in the file) with:

```ts
/** Verifies a `purl_…` API key via the apiKey plugin. */
async function verifyApiKeyToken(
  req: Request,
  bearerToken: string,
): Promise<AuthInfo | undefined> {
  let result: Awaited<ReturnType<typeof auth.api.verifyApiKey>>;
  try {
    result = await auth.api.verifyApiKey({
      body: { key: bearerToken },
      headers: req.headers,
    });
  } catch (err) {
    console.error("MCP API key verification failed:", err);
    return undefined;
  }
  if (!result.valid || !result.key) return undefined;
  return {
    token: bearerToken,
    clientId: result.key.id,
    scopes: [],
    extra: { userId: result.key.referenceId },
  };
}

/** Verifies an OAuth access token issued by Better Auth's mcp plugin. */
async function verifyOAuthToken(req: Request): Promise<AuthInfo | undefined> {
  let session: Awaited<ReturnType<typeof auth.api.getMcpSession>>;
  try {
    session = await auth.api.getMcpSession({
      request: req,
      headers: req.headers,
      asResponse: false,
    });
  } catch (err) {
    console.error("MCP OAuth token verification failed:", err);
    return undefined;
  }
  if (!session?.userId) return undefined;
  // Defense in depth: verify expiry ourselves rather than trusting the
  // endpoint to have already filtered it out.
  if (new Date(session.accessTokenExpiresAt).getTime() < Date.now()) {
    return undefined;
  }
  return {
    token: session.accessToken,
    clientId: session.clientId,
    scopes: session.scopes ? session.scopes.split(" ") : [],
    extra: { userId: session.userId },
  };
}

/**
 * Validates the `Authorization: Bearer …` header, accepting either a
 * `purl_…` API key or an OAuth access token issued via the mcp plugin's
 * Connect flow, and attaches the owning user id to the request auth context.
 */
export async function verifyToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const apiKeyInfo = await verifyApiKeyToken(req, bearerToken);
  if (apiKeyInfo) return apiKeyInfo;
  return verifyOAuthToken(req);
}
```

Remove the old single-purpose `verifyToken` implementation entirely — this replaces it in place (same export name and signature, so `src/app/api/[transport]/route.ts` needs no changes).

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run src/lib/mcp.test.ts
```
Expected: PASS — all tests in the file, including the five new/updated ones.

- [ ] **Step 5: Typecheck**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp.ts src/lib/mcp.test.ts
git commit -m "feat(mcp): accept OAuth access tokens alongside purl_ API keys"
```

---

### Task 6: Connected Apps business logic

**Files:**
- Create: `src/lib/connected-apps.ts`
- Create: `src/lib/connected-apps.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/connected-apps.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  default: {
    oauthConsent: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    oauthApplication: {
      findMany: vi.fn(),
    },
    oauthAccessToken: {
      deleteMany: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { listConnectedApps, revokeConnectedApp } = await import(
  "./connected-apps"
);

describe("listConnectedApps", () => {
  beforeEach(() => {
    vi.mocked(prisma.oauthConsent.findMany).mockReset();
    vi.mocked(prisma.oauthApplication.findMany).mockReset();
  });

  it("returns an empty list when the user has no consents", async () => {
    vi.mocked(prisma.oauthConsent.findMany).mockResolvedValue([]);
    const result = await listConnectedApps("user-1");
    expect(result).toEqual([]);
    expect(prisma.oauthApplication.findMany).not.toHaveBeenCalled();
  });

  it("joins consents with their application name, scoped to the user", async () => {
    vi.mocked(prisma.oauthConsent.findMany).mockResolvedValue([
      {
        clientId: "client-1",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ] as never);
    vi.mocked(prisma.oauthApplication.findMany).mockResolvedValue([
      { clientId: "client-1", name: "Claude Desktop" },
    ] as never);

    const result = await listConnectedApps("user-1");

    expect(prisma.oauthConsent.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", consentGiven: true },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual([
      {
        clientId: "client-1",
        name: "Claude Desktop",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });

  it("falls back to a generic name when the application row is missing", async () => {
    vi.mocked(prisma.oauthConsent.findMany).mockResolvedValue([
      { clientId: "client-2", createdAt: new Date("2026-07-01T00:00:00.000Z") },
    ] as never);
    vi.mocked(prisma.oauthApplication.findMany).mockResolvedValue([]);

    const result = await listConnectedApps("user-1");
    expect(result).toEqual([
      {
        clientId: "client-2",
        name: "Unknown app",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("revokeConnectedApp", () => {
  beforeEach(() => {
    vi.mocked(prisma.oauthAccessToken.deleteMany).mockReset();
    vi.mocked(prisma.oauthConsent.deleteMany).mockReset();
  });

  it("deletes access tokens and the consent record scoped to the user and client", async () => {
    vi.mocked(prisma.oauthConsent.deleteMany).mockResolvedValue({ count: 1 } as never);

    await revokeConnectedApp("user-1", "client-1");

    expect(prisma.oauthAccessToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
    expect(prisma.oauthConsent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-1" },
    });
  });

  it("returns false when there was nothing to revoke", async () => {
    vi.mocked(prisma.oauthConsent.deleteMany).mockResolvedValue({ count: 0 } as never);
    const result = await revokeConnectedApp("user-1", "client-1");
    expect(result).toBe(false);
  });

  it("returns true when a consent record was deleted", async () => {
    vi.mocked(prisma.oauthConsent.deleteMany).mockResolvedValue({ count: 1 } as never);
    const result = await revokeConnectedApp("user-1", "client-1");
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm vitest run src/lib/connected-apps.test.ts
```
Expected: FAIL with "Failed to resolve import ./connected-apps" (the module doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/connected-apps.ts`**

```ts
import "server-only";

import prisma from "@/lib/prisma";

export type ConnectedApp = {
  clientId: string;
  name: string;
  createdAt: string;
};

/** Lists the OAuth clients a user has actively consented to, newest first. */
export async function listConnectedApps(
  userId: string,
): Promise<ConnectedApp[]> {
  const consents = await prisma.oauthConsent.findMany({
    where: { userId, consentGiven: true },
    orderBy: { createdAt: "desc" },
  });
  if (consents.length === 0) return [];

  const apps = await prisma.oauthApplication.findMany({
    where: { clientId: { in: consents.map((c) => c.clientId) } },
  });
  const nameByClientId = new Map(apps.map((a) => [a.clientId, a.name]));

  return consents.map((consent) => ({
    clientId: consent.clientId,
    name: nameByClientId.get(consent.clientId) ?? "Unknown app",
    createdAt: consent.createdAt.toISOString(),
  }));
}

/**
 * Revokes a connected app: deletes its access/refresh tokens (so it stops
 * working immediately) and its consent record (so it must re-prompt on
 * reconnect), both scoped to the given user.
 */
export async function revokeConnectedApp(
  userId: string,
  clientId: string,
): Promise<boolean> {
  await prisma.oauthAccessToken.deleteMany({ where: { userId, clientId } });
  const { count } = await prisma.oauthConsent.deleteMany({
    where: { userId, clientId },
  });
  return count > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run src/lib/connected-apps.test.ts
```
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connected-apps.ts src/lib/connected-apps.test.ts
git commit -m "feat(mcp): add connected-apps list/revoke business logic"
```

---

### Task 7: Connected Apps API routes

**Files:**
- Create: `src/app/api/user/connected-apps/route.ts`
- Create: `src/app/api/user/connected-apps/route.test.ts`
- Create: `src/app/api/user/connected-apps/[clientId]/route.ts`
- Create: `src/app/api/user/connected-apps/[clientId]/route.test.ts`

- [ ] **Step 1: Write the failing test for the list route**

Create `src/app/api/user/connected-apps/route.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockListConnectedApps = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  listConnectedApps: mockListConnectedApps,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { auth } = await import("@/lib/auth");
const { GET } = await import("./route");

describe("GET /api/user/connected-apps", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    mockListConnectedApps.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/user/connected-apps"));
    expect(res.status).toBe(401);
    expect(mockListConnectedApps).not.toHaveBeenCalled();
  });

  it("returns the user's connected apps", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    mockListConnectedApps.mockResolvedValue([
      { clientId: "client-1", name: "Claude Desktop", createdAt: "2026-07-01T00:00:00.000Z" },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/user/connected-apps"));
    expect(mockListConnectedApps).toHaveBeenCalledWith("user-1");
    expect(await res.json()).toEqual([
      { clientId: "client-1", name: "Claude Desktop", createdAt: "2026-07-01T00:00:00.000Z" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
pnpm vitest run src/app/api/user/connected-apps/route.test.ts
```
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement the list route**

Create `src/app/api/user/connected-apps/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { listConnectedApps } from "@/lib/connected-apps";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listConnectedApps(session.user.id);
  return NextResponse.json(apps);
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
pnpm vitest run src/app/api/user/connected-apps/route.test.ts
```
Expected: PASS.

- [ ] **Step 5: Write the failing test for the revoke route**

Create `src/app/api/user/connected-apps/[clientId]/route.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockRevokeConnectedApp = vi.fn();
vi.mock("@/lib/connected-apps", () => ({
  revokeConnectedApp: mockRevokeConnectedApp,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const { auth } = await import("@/lib/auth");
const { DELETE } = await import("./route");

function makeContext(clientId: string) {
  return { params: Promise.resolve({ clientId }) };
}

describe("DELETE /api/user/connected-apps/[clientId]", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    mockRevokeConnectedApp.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(res.status).toBe(401);
    expect(mockRevokeConnectedApp).not.toHaveBeenCalled();
  });

  it("returns 404 when there was nothing to revoke", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    mockRevokeConnectedApp.mockResolvedValue(false);

    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 and revokes the app scoped to the session user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    mockRevokeConnectedApp.mockResolvedValue(true);

    const res = await DELETE(
      new NextRequest("http://localhost/api/user/connected-apps/client-1"),
      makeContext("client-1"),
    );
    expect(mockRevokeConnectedApp).toHaveBeenCalledWith("user-1", "client-1");
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run:
```bash
pnpm vitest run "src/app/api/user/connected-apps/[clientId]/route.test.ts"
```
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 7: Implement the revoke route**

Create `src/app/api/user/connected-apps/[clientId]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { revokeConnectedApp } from "@/lib/connected-apps";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await context.params;
  const revoked = await revokeConnectedApp(session.user.id, clientId);

  if (!revoked) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: Run to verify it passes**

Run:
```bash
pnpm vitest run "src/app/api/user/connected-apps/[clientId]/route.test.ts"
```
Expected: PASS.

- [ ] **Step 9: Typecheck and lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/user/connected-apps
git commit -m "feat(mcp): add Connected Apps list/revoke API routes"
```

---

### Task 8: Connected Apps UI in Settings → Integrations

**Files:**
- Modify: `src/components/settings-integrations.tsx`

- [ ] **Step 1: Add the Connected Apps section**

In `src/components/settings-integrations.tsx`, add a new `ConnectedApp` type, state, effect, and section. Insert the type near the top (after the existing `CreatedApiKey` type):

```ts
type ConnectedApp = {
  clientId: string;
  name: string;
  createdAt: string;
};
```

Inside the `SettingsIntegrations` function, add state and a fetch effect (alongside the existing `keys`/`loading` state):

```ts
  const [connectedApps, setConnectedApps] = React.useState<ConnectedApp[]>([]);
  const [connectedAppsLoading, setConnectedAppsLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/user/connected-apps")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: ConnectedApp[]) =>
        setConnectedApps(Array.isArray(data) ? data : []),
      )
      .catch(() => {
        toast.error("Failed to load connected apps");
        setConnectedApps([]);
      })
      .finally(() => setConnectedAppsLoading(false));
  }, []);

  const handleRevokeConnectedApp = async (clientId: string) => {
    try {
      const res = await fetch(`/api/user/connected-apps/${clientId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to revoke app");
        return;
      }
      setConnectedApps((prev) => prev.filter((a) => a.clientId !== clientId));
      toast.success("App disconnected");
    } catch {
      toast.error("Failed to revoke app");
    }
  };
```

Add the section markup right after the closing `</div>` of the existing API Keys list block (i.e., after the `{loading ? (...) : keys.length === 0 ? (...) : (...)}` block, still inside the outer `<div className="w-full flex-1 flex flex-col gap-4">`):

```tsx
      <SettingsItem
        title="Connected Apps"
        description="Apps you've authorized to access Purl on your behalf via OAuth."
        actions={null}
      />

      {connectedAppsLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ) : connectedApps.length === 0 ? (
        <Typography size="small" className="text-muted-foreground">
          No connected apps yet.
        </Typography>
      ) : (
        <div className="flex flex-col gap-2">
          {connectedApps.map((app) => (
            <ConnectedAppRow
              key={app.clientId}
              app={app}
              onRevoke={() => handleRevokeConnectedApp(app.clientId)}
            />
          ))}
        </div>
      )}
```

Add the `ConnectedAppRow` component at the bottom of the file, after the existing `ApiKeyRow` function:

```tsx
function ConnectedAppRow({
  app,
  onRevoke,
}: {
  app: ConnectedApp;
  onRevoke: () => Promise<void>;
}) {
  const [alertOpen, setAlertOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
      setAlertOpen(false);
    }
  };

  const connectedDate = new Date(app.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex flex-col gap-0.5 min-w-0">
        <Typography size="small" className="font-medium truncate">
          {app.name}
        </Typography>
        <Typography size="mini" className="text-muted-foreground">
          Connected {connectedDate}
        </Typography>
      </div>
      <AlertDialog
        open={alertOpen}
        onOpenChange={(v) => !revoking && setAlertOpen(v)}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="cursor-pointer shrink-0"
          >
            Revoke
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="default" className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect app?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{app.name}</span> will
              immediately lose access to your Purl account. This cannot be
              undone — you'd need to reconnect and re-authorize it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={revoking}
              className="cursor-pointer"
              onClick={() => void handleRevoke()}
            >
              {revoking ? "Revoking…" : "Revoke access"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: no errors. (`SettingsItem`'s `actions` prop is typed `React.ReactNode`, so passing `null` is valid.)

- [ ] **Step 3: Manual check in the browser**

Run `pnpm dev`, log in, open Settings → Integrations, and confirm:
- A "Connected Apps" section renders below the API Keys section.
- With no connected apps yet, it shows "No connected apps yet."
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings-integrations.tsx
git commit -m "feat(mcp): add Connected Apps section to Settings > Integrations"
```

---

### Task 9: OAuth consent screen

> **Note (post-implementation):** originally planned under `src/app/(public)/oauth/consent`, but relocated to the top-level `src/app/oauth/` segment with its own `layout.tsx`. The `(public)` route group's layout sets `export const dynamic = "force-static"`, which Next.js propagates to all descendant pages regardless of their own `dynamic` export, silently zeroing out `searchParams` — a real bug discovered during manual browser verification, not a stylistic choice.

**Files:**
- Create: `src/app/oauth/consent/page.tsx`
- Create: `src/components/oauth-consent-actions.tsx`

- [ ] **Step 1: Create the client component that handles Allow/Deny**

Create `src/components/oauth-consent-actions.tsx`:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export function OAuthConsentActions({ consentCode }: { consentCode: string }) {
  const [submitting, setSubmitting] = React.useState<"allow" | "deny" | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (accept: boolean) => {
    setSubmitting(accept ? "allow" : "deny");
    setError(null);
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      if (!res.ok) {
        throw new Error(`Consent request failed with status ${res.status}`);
      }
      const data = (await res.json()) as { redirectURI: string };
      window.location.href = data.redirectURI;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit your decision",
      );
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button
          className="cursor-pointer"
          disabled={submitting !== null}
          onClick={() => void submit(true)}
        >
          {submitting === "allow" ? "Connecting…" : "Allow"}
        </Button>
        <Button
          variant="secondary"
          className="cursor-pointer"
          disabled={submitting !== null}
          onClick={() => void submit(false)}
        >
          {submitting === "deny" ? "Denying…" : "Deny"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create the consent page (server component)**

Create `src/app/oauth/consent/page.tsx`:

```tsx
import { OAuthConsentActions } from "@/components/oauth-consent-actions";
import { Typography } from "@/components/typography";
import prisma from "@/lib/prisma";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    consent_code?: string;
    client_id?: string;
    scope?: string;
  }>;
}) {
  const { consent_code: consentCode, client_id: clientId, scope } =
    await searchParams;

  if (!consentCode || !clientId) {
    return (
      <div className="wrapper-private flex min-h-screen flex-col items-center justify-center gap-2 pb-12 pt-24">
        <Typography variant="h3" component="h1">
          Invalid authorization request
        </Typography>
        <Typography size="small" className="text-muted-foreground">
          This link is missing required information. Please restart the
          connection from your MCP client.
        </Typography>
      </div>
    );
  }

  const client = await prisma.oauthApplication.findUnique({
    where: { clientId },
    select: { name: true },
  });
  const clientName = client?.name ?? "This app";
  const scopes = scope ? scope.split(" ") : [];

  return (
    <div className="wrapper-private flex min-h-screen flex-col items-center justify-center gap-6 pb-12 pt-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <Typography variant="h3" component="h1">
          Authorize {clientName}
        </Typography>
        <Typography size="small" className="text-muted-foreground max-w-md">
          {clientName} wants to access your Purl account
          {scopes.length > 0 ? ` (${scopes.join(", ")})` : ""}. It will be
          able to search, save, and read your saved content on your behalf.
        </Typography>
      </div>
      <OAuthConsentActions consentCode={consentCode} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Manual check**

Run `pnpm dev` and visit `http://localhost:3000/oauth/consent?consent_code=test&client_id=nonexistent&scope=openid%20profile` directly in the browser (while logged in, since this route has no proxy bypass and requires a session per Task 4's note).

Expected: the page renders "Authorize This app" (since `nonexistent` won't match a real `oauthApplication` row) with Allow/Deny buttons and the requested scopes listed. Clicking either button will show an error (expected — `test` isn't a real pending consent code), confirming the fetch/error-handling path works without crashing.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(public\)/oauth/consent src/components/oauth-consent-actions.tsx
git commit -m "feat(mcp): add OAuth consent screen"
```

---

### Task 10: End-to-end manual verification against real MCP clients

This can't be automated in Vitest — it validates the two risks flagged in the design doc (whether login-resumption works cleanly through Purl's custom login page, and whether the consent screen actually renders for real clients), plus a third risk the final whole-implementation code review surfaced: `src/proxy.ts`'s email-verification redirect (`/verify-email`) rewrites `pathname` only, dropping any pending OAuth query params (`consent_code`/`client_id`/`scope`), and `/verify-email`'s own post-verification redirect (`src/hooks/use-auth.ts`, `src/app/(public)/verify-email/page.tsx`) hardcodes `/home` — so a brand-new user who signs up via Claude's "Connect" button (triggering Purl's `emailVerification.sendOnSignUp: true`) would lose the pending authorization after verifying, with no visible error. Task 10 tests with an *existing* account by default (Step 1) — Step 1a below specifically exercises the fresh-signup path, since it's a distinct risk that wouldn't otherwise get covered.

**Files:** none (manual QA pass, run against a deployed preview or `pnpm build && pnpm start` locally with a real Postgres + `BETTER_AUTH_URL` reachable from Claude).

- [ ] **Step 1: Fresh-login round trip**

Log out of Purl entirely (clear cookies or use an incognito window). In Claude Desktop, add Purl as a custom connector with URL `https://<your-preview-domain>/api/mcp` and click **Connect**.

Expected: you're redirected to Purl's `/login` page. Log in. Confirm you land back in a flow that completes the OAuth authorization (either directly redirected to Claude's callback, or — if the consent screen renders — to `/oauth/consent` first) rather than being dumped at `/home`.

If you land at `/home` instead of resuming the OAuth flow: this confirms the login-resumption risk from the design doc. The fix is to check `document.cookie` for Better Auth's `oidc_login_prompt` cookie (or check for OAuth-flow query params) in `src/hooks/use-auth.ts`'s `signInWithEmail`, and if present, do `window.location.href = window.location.href` (a full reload) instead of `router.replace("/home")`, so Better Auth's server-side resumption hook — which needs the original request context — gets a chance to run. This isn't written out in advance because it depends on what's actually observed in this step.

- [ ] **Step 1a: Fresh-signup round trip (new-user path)**

Same as Step 1, but instead of logging into an existing account, click **Connect** with no Purl account at all, and sign up fresh when prompted (triggering `emailVerification.sendOnSignUp: true`).

Expected risk: after email verification, you'll likely land at `/home` with the OAuth authorization lost, rather than resuming the connection — `src/proxy.ts`'s `/verify-email` redirect only rewrites `pathname` (dropping `consent_code`/`client_id`/`scope`), and both `src/hooks/use-auth.ts` and `src/app/(public)/verify-email/page.tsx` hardcode a post-verification redirect to `/home`.

If this reproduces: this is a distinct gap from Step 1's login-resumption risk (it's specifically the email-verification detour, not the login step itself) — decide whether to fix now (thread a return-to path through `/verify-email` the same way Step 1's fallback threads it through `/login`) or explicitly accept it as a known limitation for v1 (new users would need to verify their email first via the normal signup flow, then retry Connect once logged in). Either way, record the decision in Step 6.

- [ ] **Step 2: Consent screen check**

During the same flow (or a fresh reconnect after revoking access in Settings), note whether `/oauth/consent` ever appears.

Expected either outcome is acceptable per the design decision: if it appears, verify Allow completes the connection and Deny redirects back to Claude with an error. If it never appears (Claude's client doesn't request `prompt=consent`), that matches the accepted known gap — no action needed, just confirm the connection still completes successfully via auto-approval.

- [ ] **Step 3: Tool call check**

Once connected, ask Claude to search your Purl library (exercises `search_content`) and save a URL (exercises `save_link`). Confirm both work and the results reflect your actual account's data — not another user's.

- [ ] **Step 4: Revocation check**

In Purl, go to Settings → Integrations → Connected Apps, find the newly-connected app, click Revoke. Then ask Claude to perform another tool call.

Expected: the call fails with an authorization error (401), and Claude should prompt to reconnect.

- [ ] **Step 5: Regression check — existing API key path**

Using a `purl_...` key (e.g., via Claude Code's CLI: `claude mcp add purl-cli --transport http https://<domain>/api/mcp --header "Authorization: Bearer purl_..."`), confirm the static-key path still works unaffected by any of the above.

- [ ] **Step 6: Record findings**

If Step 1 required the login-page fallback, implement it now as a follow-up commit (with its own test in `src/hooks/use-auth.test.ts` if one exists, or a manual note in the PR description if the hook has no existing test file). Note the actual observed behavior for both Steps 1 and 2 in the PR description so the "known risks" section of the design doc reflects reality.
