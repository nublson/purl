# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Purl is a single Next.js (App Router) application — **not** a monorepo. It uses Prisma with PostgreSQL (Supabase-hosted, with pgvector), Better Auth for authentication, and OpenAI for AI features.

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
- **The chat input bar at `/home`** is for saving URLs, not asking questions. AI chat questions are handled differently (via the chat interface, not the URL input bar).
- **`.env` is gitignored** — never commit it.

### Outbound URL fetching (`safeFetch`)

Link ingest, OG scraping, PDF/audio fetch, and related paths use [`src/lib/safe-outbound-fetch.ts`](src/lib/safe-outbound-fetch.ts). Optional env (server-only):

| Variable | Purpose |
|----------|---------|
| `SAFE_OUTBOUND_HTTP_PROXY` | HTTP(S) CONNECT proxy. The leg to the **proxy** uses the same pinned DNS/connect policy as direct mode; the proxy opens the upstream connection. Use an explicit URL here instead of relying on `HTTPS_PROXY` / `NO_PROXY` (mis-set `NO_PROXY` can bypass proxies). |
| `SAFE_OUTBOUND_SOCKS_PROXY` | `socks5://` or `socks://` only. Undici’s SOCKS support is experimental; the TCP connect to the SOCKS server is **not** pinned in-app—prefer HTTP proxy if you need full pinning to the egress hop. Only one of HTTP proxy or SOCKS may be set. |
| `SAFE_OUTBOUND_DNS_SERVERS` | Comma-separated resolvers passed to `dns.setServers` (e.g. `1.1.1.1,8.8.8.8`). Reduces reliance on the platform default resolver; does not replace DoH or an egress proxy. |

**Staging / production:** The proxy must be reachable from your deployment regions (e.g. Vercel). Configure the proxy to refuse private/upstream SSRF targets where possible. After enabling, smoke-test saving a normal HTTPS link, a PDF URL, and YouTube/audio flows. Proxy auth belongs only in server env, never in client-exposed vars.
