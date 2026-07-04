# MCP Readiness — Gap Analysis

What it would take to expose Purl as a **Model Context Protocol (MCP) server**, so external AI clients (Claude Desktop, Cursor, ChatGPT, etc.) can save links and search a user's knowledge base over MCP.

> **Update — IMPLEMENTED.** The MCP server now ships. Endpoint: `${BASE_URL}/api/mcp`
> (Streamable HTTP), authenticated with `purl_…` API keys via `Authorization: Bearer`.
> Route: [`src/app/api/[transport]/route.ts`](../src/app/api/[transport]/route.ts); tools/auth in
> [`src/lib/mcp.ts`](../src/lib/mcp.ts); user-facing docs at `/docs/mcp`. Tools: `search_content`,
> `save_link`, `list_saved_items`, `get_link`. The analysis below is kept for historical context.

**Status: ~70% of the groundwork is already in place.** The recent public-API work (API keys + `/api/v1`) solved the hardest MCP prerequisites — token auth and a user-scoped, non-cookie execution path. What remains is mostly the MCP protocol layer itself.

---

## What we already have (the hard parts — done)

| Capability | Where | Why it matters for MCP |
|------------|-------|------------------------|
| **Bearer-token auth** | `apiKey({ enableSessionForAPIKeys: true })` in [`src/lib/auth.ts`](../src/lib/auth.ts) | `auth.api.getSession({ headers })` now resolves a `userId` from `Authorization: Bearer purl_…`. MCP clients can authenticate with no cookie. **This was the #1 blocker — now gone.** |
| **API key lifecycle** | [`/api/v1/keys`](../src/app/api/v1/keys/route.ts), `/api/v1/keys/[id]`, [`settings-integrations.tsx`](../src/components/settings-integrations.tsx) | Users can already mint/list/revoke keys in Settings → an MCP client just pastes one. |
| **User-scoped lib, cookie-free** | `getCurrentUserId()` → `getSession({ headers })` in [`src/lib/links.ts:350`](../src/lib/links.ts) | Because API keys flow through the *same* `getSession`, the existing `createLink`/`listLinks`/etc. work unchanged under bearer auth. **No lib refactor needed.** |
| **Semantic search** | `semanticSearch(query, userId, opts)` in [`src/lib/semantic-search.ts`](../src/lib/semantic-search.ts) | Already takes an explicit `userId` — drop-in for an MCP tool. |
| **Public REST surface** | [`/api/v1/links`](../src/app/api/v1/links/route.ts) (GET/POST), `/api/v1/links/[id]` | Proves the API-key path end-to-end; MCP reuses the same functions. |
| **Middleware bypass for token routes** | [`src/proxy.ts:44`](../src/proxy.ts) (`/api/v1/*` skips the session redirect) | Same pattern needed for the MCP route — already established. |
| **Tool definitions** | `listSavedItems` + `searchContent` in [`src/lib/chat.ts`](../src/lib/chat.ts) | The exact tool shapes/descriptions an MCP would expose. Reuse verbatim. |
| **API docs page** | [`/docs/api`](../src/app/(public)/docs/api/page.tsx) | A place to document the MCP endpoint too. |
| **Plan enforcement & usage** | `assertCanSaveLink`/`assertCanChat`, `recordUsage`, `getEntitlementContext` | Reusable guards so MCP can't bypass caps. |

---

## What's still missing (the MCP-specific layer)

### 1. MCP transport + handler (no SDK installed)
No MCP runtime exists. `@modelcontextprotocol/sdk` and `mcp-handler` (formerly `@vercel/mcp-adapter`) are not in `package.json`.

**Needed:**
- Add `mcp-handler` (+ peer `@modelcontextprotocol/sdk`) — Streamable HTTP transport, works on Vercel Fluid Compute.
- A route: `src/app/api/[transport]/route.ts` (or `src/app/api/mcp/[transport]/route.ts`) exporting `GET`/`POST`/`DELETE` from `createMcpHandler(...)`.

```ts
// sketch — src/app/api/mcp/[transport]/route.ts
import { createMcpHandler } from "mcp-handler";
import { auth } from "@/lib/auth";
import { createLink, listLinks } from "@/lib/links";
import { semanticSearch } from "@/lib/semantic-search";
import { headers } from "next/headers";

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized"); // see §2
  return session.user.id;
}

const handler = createMcpHandler((server) => {
  server.tool("save_link", "Save a URL to the user's library", { url: z.string().url() },
    async ({ url }) => {
      await requireUserId();                  // auth gate
      const link = await createLink(url);      // existing lib — resolves userId itself
      return { content: [{ type: "text", text: JSON.stringify(serializeLink(link)) }] };
    });

  server.tool("search_content", "Semantic search over saved content", { query: z.string() },
    async ({ query }) => {
      const userId = await requireUserId();
      const results = await semanticSearch(query, userId, {});
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    });

  server.tool("list_saved_items", "List saved items (metadata only)", { /* … */ },
    async () => { /* port of listSavedItems / listLinks */ });
});
export { handler as GET, handler as POST, handler as DELETE };
```

> Confirm the API-key getter sees the MCP request's `Authorization` header. The plugin's `customAPIKeyGetter` ([`auth.ts:13`](../src/lib/auth.ts)) reads `ctx.request.headers` / `ctx.headers`, and route handlers expose those via `await headers()` — same as the working `/api/v1` routes — so it should resolve cleanly.

### 2. Spec-correct auth challenge (small)
MCP clients expect a `401` with a `WWW-Authenticate` header pointing at OAuth resource metadata so they can discover the auth flow. We're using API keys, not OAuth, so the pragmatic path is: document "paste your `purl_…` key as a Bearer token" and return a plain `401` for missing/invalid keys. Clients that support custom headers / static bearer tokens (Claude Desktop, Cursor) work fine with this. Full OAuth 2.1 (Better Auth ships an `mcp`/OIDC plugin) is a later upgrade, not required for v1.

### 3. Expose semantic search (currently internal-only)
`semanticSearch` exists but is **not** reachable over any HTTP/public surface — `/api/v1` only does links CRUD. This is the single most valuable MCP tool (query your knowledge base), so MCP is the first place it gets exposed. Gate it on `entitlements.aiFullAccess` (same as the `searchContent` chat tool does).

### 4. Validation library — add `zod`
The MCP SDK's `server.tool(...)` expects Zod schemas. The codebase currently uses `jsonSchema<T>()` from the `ai` package, and **`zod` is not a dependency**. Add `zod` (matches the broader AI SDK ecosystem) — lowest-friction option.

### 5. Open the MCP route in `proxy.ts`
[`src/proxy.ts:44`](../src/proxy.ts) already bypasses the session redirect for `/api/v1/*`. Add the MCP route prefix (e.g. `/api/mcp/`) to the same bypass so requests reach the handler and auth is enforced there. Also extend the `matcher` if the path falls outside current coverage.

### 6. Cross-cutting concerns to carry over
- **Entitlements + usage:** MCP `save_link`/`search` must run `assertCanSaveLink` / `aiFullAccess` checks and `recordUsage`, or MCP becomes a cap-bypass. (`createLink` already enforces save limits internally.)
- **Rate limiting:** `src/lib/proxy-rate-limit.ts` now covers `/api/mcp` — 60 req/min (Upstash), keyed by resolved userId (falls back to the raw Bearer token, then IP), same pattern as `/api/v1`.
- **Observability:** add a `feature:mcp` (or `source:mcp`) tag to Gateway embedding/search calls so MCP usage is attributable.
- **SSRF:** `save_link` → `createLink` → existing `safeFetch` guards, so it's already covered.

---

## Suggested tool surface (v1)

| MCP tool | Backed by | Notes |
|----------|-----------|-------|
| `search_content(query, type?, dateFrom?, dateTo?, limit?)` | `semanticSearch` | Highest value; gate on `aiFullAccess` |
| `save_link(url)` | `createLink` | Returns serialized link + ingest status |
| `list_saved_items(type?, dateFrom?, dateTo?, limit?)` | `listLinks` / port of `listSavedItems` | Metadata only |
| `get_link(id)` *(optional)* | `readLink` | Full content for one item |

Descriptions can be lifted verbatim from the existing chat tools in [`src/lib/chat.ts`](../src/lib/chat.ts).

---

## Implementation order

1. **Add deps:** `mcp-handler`, `@modelcontextprotocol/sdk`, `zod`.
2. **Create `src/app/api/mcp/[transport]/route.ts`** with `createMcpHandler`, a `requireUserId()` helper, and the four tools wired to existing lib functions.
3. **Open the route in `proxy.ts`** (bypass + matcher).
4. **Wire entitlements/usage/rate-limit + `feature:mcp` tag** into each tool.
5. **Tests (Vitest):** mock `getSession` → `userId`, assert each tool enforces ownership + plan caps; mirror the `/api/v1` route tests.
6. **Document** the endpoint and "use your `purl_…` key as a Bearer token" on [`/docs/api`](../src/app/(public)/docs/api/page.tsx).

---

## Open decisions
- **Auth depth:** ship with static API-key bearer (fast, works with major clients) vs. full OAuth 2.1 via Better Auth's `mcp` plugin (spec-complete, more work). Recommend API-key for v1.
- **Validation:** add `zod` (recommended) vs. adapt the SDK to raw JSON schema.
- **Route path:** `/api/[transport]` (root) vs. `/api/mcp/[transport]` (namespaced — cleaner alongside `/api/v1`).
- **Scope:** read-only (search/list) first, or include `save_link` writes in v1.
