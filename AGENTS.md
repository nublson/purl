# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Purl is a single Next.js (App Router) application — **not** a monorepo. It uses Prisma with PostgreSQL (Supabase-hosted), Better Auth for authentication, and Supabase Storage/Realtime. There is no AI provider integration: the in-app chat and the ingestion/embeddings pipeline were removed.

### Environment variables

All required secrets are injected as environment variables. On first setup, create a `.env` from `.env.example` and populate it from the environment:

```bash
python3 -c "
import os
with open('.env.example') as f:
    lines = [l.strip() for l in f if l.strip() and not l.startswith('#')]
keys = [l.split('=')[0].strip() for l in lines]
with open('.env', 'w') as f:
    for k in keys:
        v = os.environ.get(k, '')
        if k == 'BETTER_AUTH_URL': v = 'http://localhost:' + '3000'
        if k in ('NEXT_PUBLIC_SENTRY_ENABLED', 'SENTRY_ENABLED'): v = 'false'
        f.write(f'{k}={v}\n')
"
```

### Key commands

See `README.md` and `package.json` scripts for the full list. Quick reference:

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Migrate DB | `pnpm prisma migrate deploy` |
| Generate Prisma client | `pnpm prisma generate` |
| Dev server | `pnpm dev` (port 3000) |
| Lint | `pnpm lint` |
| Tests | `pnpm test` |
| Build | `pnpm build` |

### Gotchas

- **Prisma client must be generated** before `pnpm dev` or `pnpm build` will work. The build script (`pnpm build`) already includes `prisma generate`, but `pnpm dev` does not — run `pnpm prisma generate` first if `src/generated/prisma` is missing.
- **Sentry build plugin**: The `@sentry/cli` build script is ignored by pnpm. This is expected and does not affect local dev. The warning about `pnpm approve-builds` can be safely ignored.
- **Email verification on signup**: Resend sends a real email. For local dev/testing, manually set `emailVerified = true` on the user record in the database if you can't receive the verification email.
- **The in-app AI chat was removed.** `/ai` and `/chat/*` permanently redirect to `/home` via `redirects()` in `next.config.ts`.
- **`.env` is gitignored** — never commit it.
- **Save limit**: every account is capped at `MAX_SAVED_LINKS` (1,000) in `src/lib/limits.ts`; there are no paid plans. Keep in-app copy, the API docs page, and the terms in sync when changing it.
- **Vitest and Prisma**: `src/vitest.setup.ts` sets a placeholder `DATABASE_URL` when unset so modules that initialize Prisma can load in unit tests before per-file mocks apply.
- **Usage UI**: The link count and cap for the signed-in user live in **Settings → Usage**, not on `/home`. The app shell layout loads them with `getUsageSummaryForUser` and passes the result into the settings dialog (`src/app/(private)/(app)/layout.tsx`, `src/lib/usage-summary.ts`, `src/components/dialog-settings.tsx`).

### Outbound URL fetching (`safeFetch`)

OG/metadata scraping, content-type sniffing, the PDF proxy, and related paths use [`src/lib/safe-outbound-fetch.ts`](src/lib/safe-outbound-fetch.ts). Optional env (server-only):

| Variable | Purpose |
|----------|---------|
| `SAFE_OUTBOUND_HTTP_PROXY` | HTTP(S) CONNECT proxy. The leg to the **proxy** uses the same pinned DNS/connect policy as direct mode; the proxy opens the upstream connection. Use an explicit URL here instead of relying on `HTTPS_PROXY` / `NO_PROXY` (mis-set `NO_PROXY` can bypass proxies). |
| `SAFE_OUTBOUND_SOCKS_PROXY` | `socks5://` or `socks://` only. Undici’s SOCKS support is experimental; the TCP connect to the SOCKS server is **not** pinned in-app—prefer HTTP proxy if you need full pinning to the egress hop. Only one of HTTP proxy or SOCKS may be set. |
| `SAFE_OUTBOUND_DNS_SERVERS` | Comma-separated resolvers passed to `dns.setServers` (e.g. `1.1.1.1,8.8.8.8`). Reduces reliance on the platform default resolver; does not replace DoH or an egress proxy. |

**Staging / production:** The proxy must be reachable from your deployment regions (e.g. Vercel). Configure the proxy to refuse private/upstream SSRF targets where possible. After enabling, smoke-test saving a normal HTTPS link, a PDF URL, and a YouTube URL. Proxy auth belongs only in server env, never in client-exposed vars.

**Production setup (Webshare / Vercel env / redeploy / smoke-test):** See [`docs/production-outbound-proxy.md`](docs/production-outbound-proxy.md).

## Learned User Preferences

- When implementing an attached plan, treat the plan file as read-only, use the already-created todos instead of creating new ones, mark todos in progress as work advances, and continue until all todos are complete.
- When the user asks for a branch or PR after implementation, follow the project Git workflow: short-lived feature/fix branches from `develop`, target PRs to `develop`, and avoid direct commits to `main` or `develop`; when Cursor diff-tab actions specify the configured `cursor/` prefix, use `cursor/<short-description>` instead.
- Prefer React context (e.g., `UsageContext`) over custom-event or event-emitter patterns for cross-component reactive state; if an event-based approach is proposed and rejected, migrate to a context instead.
- When a feature is complete, the user may ask for "isolated commits related to what we did" — group changes into small logical atomic commits per feature area rather than one large catch-all commit.
- Use existing UI wrappers (`dialog-wrapper`, `dropdown-wrapper`, `alert-dialog-wrapper`) when adding modals, dropdowns, or confirm dialogs; match patterns used elsewhere instead of inlining raw Radix/shadcn primitives.
- Context files should export only the context object and Provider; consumer `useContext` hooks belong in `src/hooks/use-*.ts`, matching the existing `use-usage.ts` / `use-auth.ts` pattern (do not inline hooks in context files).
- Prefer extending declarative `publicRoutes` in `src/proxy.ts` (with prefix matching) over ad-hoc special-case path checks when making route trees publicly accessible.

## Learned Workspace Facts

- Widespread `SCRAPE_FAILED` on every URL in local dev often means `SAFE_OUTBOUND_HTTP_PROXY` is set but unreachable or returns HTTP 407; unset it for direct egress or verify the proxy with `curl -x "$SAFE_OUTBOUND_HTTP_PROXY" https://example.com` before debugging scrapers.
- Server-only modules (e.g. those importing Prisma/pg) must not bleed into the client bundle; extract shared types, constants, and pure functions into a `*-shared.ts` sibling file, and guard the server module with `import "server-only"` at the top.
- Route-level loading skeletons use a component in `src/components/skeletons/` plus a route `loading.tsx` (e.g. `/home`).
- Docs under `src/app/(public)/docs/` still need a `publicRoutes` entry in `src/proxy.ts` — the `(public)` route group alone does not bypass auth middleware.
- `publicRoutes` in `src/proxy.ts` supports `match: "exact" | "prefix"` and optional `skipSessionLookup` (e.g. `/docs` and `/api/auth` use prefix matching).
