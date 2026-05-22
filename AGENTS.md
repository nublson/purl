# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Purl is a single Next.js (App Router) application — **not** a monorepo. It uses Prisma with PostgreSQL (Supabase-hosted, with pgvector), Better Auth for authentication, **Vercel AI Gateway** (Claude chat + OpenAI embeddings), and **OpenAI** (Whisper transcription only). Gateway requests include **`user`** (Better Auth id) and **`tags`** (`feature:chat`, `feature:ingest`, `feature:semantic-search`, plus `env:…` on chat) for Vercel AI usage dashboards and optional per-user rate limits.

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

- **AI Gateway tagging**: Chat uses [`src/lib/chat.ts`](src/lib/chat.ts) (`feature:chat`, `user`). Embeddings use [`src/lib/embeddings.ts`](src/lib/embeddings.ts) via [`src/lib/semantic-search.ts`](src/lib/semantic-search.ts) and ingest handlers (`feature:semantic-search` vs `feature:ingest`, `user`). Whisper stays on `OPENAI_API_KEY` only — not routed through the gateway.
- **Prisma client must be generated** before `pnpm dev` or `pnpm build` will work. The build script (`pnpm build`) already includes `prisma generate`, but `pnpm dev` does not — run `pnpm prisma generate` first if `src/generated/prisma` is missing.
- **Sentry build plugin**: The `@sentry/cli` build script is ignored by pnpm. This is expected and does not affect local dev. The warning about `pnpm approve-builds` can be safely ignored.
- **Email verification on signup**: Resend sends a real email. For local dev/testing, manually set `emailVerified = true` on the user record in the database if you can't receive the verification email.
- **The chat input bar at `/home`** is for saving URLs, not asking questions. AI chat questions are handled differently (via the chat interface, not the URL input bar).
- **`.env` is gitignored** — never commit it.
- **Stripe billing**: Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and both `STRIPE_PRICE_PRO_*` price IDs for Checkout to work. Webhook processing uses idempotent `ProcessedStripeEvent` rows; configure a webhook URL that receives `checkout.session.completed`, `customer.subscription.*`, and `invoice.payment_*`. Trial is **internal** (7 days on signup); upgrading goes through Checkout. For local dev, use `stripe listen` and paste the CLI webhook secret into `STRIPE_WEBHOOK_SECRET`.
- **Billing & limits reference**: When changing plans, caps, or in-app copy, treat [`docs/commercial-model.md`](docs/commercial-model.md) as canonical.
- **Vitest and Prisma**: `src/vitest.setup.ts` sets a placeholder `DATABASE_URL` when unset so modules that initialize Prisma can load in unit tests before per-file mocks apply.
- **Plan usage UI**: Usage caps and progress for the signed-in user live in **Settings → Usage**, not on `/home`. The private app layout loads them with `getUsageSummaryForUser` and passes the result into the settings dialog (`src/app/(private)/layout.tsx`, `src/lib/usage-summary.ts`, `src/components/dialog-settings.tsx`).

### Outbound URL fetching (`safeFetch`)

Link ingest, OG scraping, PDF/audio fetch, and related paths use [`src/lib/safe-outbound-fetch.ts`](src/lib/safe-outbound-fetch.ts). Optional env (server-only):

| Variable | Purpose |
|----------|---------|
| `SAFE_OUTBOUND_HTTP_PROXY` | HTTP(S) CONNECT proxy. The leg to the **proxy** uses the same pinned DNS/connect policy as direct mode; the proxy opens the upstream connection. Use an explicit URL here instead of relying on `HTTPS_PROXY` / `NO_PROXY` (mis-set `NO_PROXY` can bypass proxies). |
| `SAFE_OUTBOUND_SOCKS_PROXY` | `socks5://` or `socks://` only. Undici’s SOCKS support is experimental; the TCP connect to the SOCKS server is **not** pinned in-app—prefer HTTP proxy if you need full pinning to the egress hop. Only one of HTTP proxy or SOCKS may be set. |
| `SAFE_OUTBOUND_DNS_SERVERS` | Comma-separated resolvers passed to `dns.setServers` (e.g. `1.1.1.1,8.8.8.8`). Reduces reliance on the platform default resolver; does not replace DoH or an egress proxy. |

**Staging / production:** The proxy must be reachable from your deployment regions (e.g. Vercel). Configure the proxy to refuse private/upstream SSRF targets where possible. After enabling, smoke-test saving a normal HTTPS link, a PDF URL, and YouTube/audio flows. Proxy auth belongs only in server env, never in client-exposed vars.

**Production setup (Webshare / Vercel env / redeploy / smoke-test):** See [`docs/production-outbound-proxy.md`](docs/production-outbound-proxy.md).

## Learned User Preferences

- When implementing an attached plan, treat the plan file as read-only, use the already-created todos instead of creating new ones, mark todos in progress as work advances, and continue until all todos are complete.
- When the user asks for a branch or PR after implementation, follow the project Git workflow: short-lived feature/fix branches from `develop`, target PRs to `develop`, and avoid direct commits to `main` or `develop`.

## Learned Workspace Facts

- `SKIPPED` ingest status covers metadata-only skips such as free-plan extraction limits and known unsupported SPA/full-browser hosts; use `skipIngest` for reusable skip behavior.
