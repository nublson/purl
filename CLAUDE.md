# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Purl

Read-it-later app: a home for your "pearls". Users save URLs (web, PDF, YouTube, audio) or upload PDF/audio files; Purl resolves metadata (title, favicon, description, thumbnail) and keeps them in one place. There is no AI layer: the in-app chat and the extraction/embeddings/semantic-search pipeline were removed. `/ai` and `/chat/*` redirect to `/home` via `redirects()` in `next.config.ts`.

Plans: Free (limited) and Pro ($39 one-time). New signups get a 7-day Pro trial. Exact caps live in [`docs/commercial-model.md`](docs/commercial-model.md) — treat it as canonical when touching plan logic.

## Commands

```bash
pnpm install                  # install deps
pnpm prisma generate          # generate Prisma client (required before pnpm dev if src/generated/prisma is missing)
pnpm prisma migrate dev       # run DB migrations locally
pnpm dev                      # dev server on port 3000
pnpm build                    # prisma generate + next build (includes Sentry source map upload)
pnpm start                    # production server (also needed to test PWA/service worker)
pnpm lint                     # ESLint
pnpm typecheck                # tsc --noEmit
pnpm test                     # vitest run (single pass)
pnpm test:watch               # vitest watch mode
```

Run a single test file: `pnpm vitest run src/lib/entitlements.test.ts`

## Architecture

Single Next.js App Router application (not a monorepo).

### Route groups

- `src/app/(public)/` — Marketing site (landing, login, signup, terms, privacy)
- `src/app/(private)/` — Authenticated app: `/home` (save links)
- `src/app/api/` — API routes (links, upload, billing, auth, admin, feedback, v1, MCP)
- `src/app/sw.ts` — Serwist PWA service worker (compiled to `public/sw.js` on build; **disabled in dev**)
- `src/app/~offline/` — Static offline fallback page

### Core library (`src/lib/`)

Business logic. Key modules:

| Module | Purpose |
|--------|---------|
| `links.ts` | Link CRUD, `scrapeLinkMetadata`, `resolveLinkFromUrl` |
| `server-detect-content-type.ts` | SSRF-safe HEAD/sniff to classify URL |
| `safe-outbound-fetch.ts` | SSRF-hardened fetch wrapper — **all outbound HTTP must go through this** |
| `entitlements.ts`, `usage-summary.ts` | Plan enforcement (save cap, uploads) and the Settings → Usage summary |
| `auth.ts`, `prisma.ts` | Better Auth and Prisma client singletons |
| `stripe.ts` | Stripe Checkout, Customer Portal, webhook handling |
| `realtime-broadcast.ts` | Supabase Realtime sync |
| `proxy-rate-limit.ts` | Optional Upstash Redis rate limiting (applied in `src/proxy.ts`) |

### Save flow

Saving is fully **synchronous**; there is no background processing:

1. `POST /api/links` (or v1 API / MCP `save_link`) → `detectContentType` + `scrapeLinkMetadata`; `POST /api/upload` stores the file in Supabase Storage
2. Insert (or refresh, for a duplicate URL) the `Link` row
3. `broadcastLinksChanged` → Supabase Realtime → client refresh

### Authentication & routing

- **Better Auth** (`src/lib/auth.ts`) — email/password sessions stored in Postgres
- **`src/proxy.ts`** — Next.js middleware that gates private routes, applies rate limiting, and (optionally) enforces email verification
- Session is resolved server-side in API routes: `auth.api.getSession({ headers: request.headers })`

### Components (`src/components/`)

- `ui/` — Radix UI + shadcn/ui base components
- `animate-ui/` — Motion animations
- `skeletons/` — Loading states

### Database (Prisma)

Key enums: `ContentType` (WEB, YOUTUBE, PDF, AUDIO), `PlanKey` (FREE, PRO, PRO_TRIAL), `SubStatus`.

Prisma client output: `src/generated/prisma` (gitignored — must be generated).

## Testing

Vitest, node environment. Test files: `src/**/*.test.ts`.

`src/vitest.setup.ts` handles three important mocks that must not be bypassed:
- Sets a dummy `DATABASE_URL` so Prisma modules load without a real DB
- Mocks `server-only` so server modules can be imported in tests
- Mocks `undici` fetch to respect `globalThis.fetch` stubs
- Mocks `node:dns/promises` to return a public IP (passes SSRF guards)

Test patterns: mock `globalThis.fetch`, mock Prisma client calls, mock Stripe / Supabase clients. Tests focus on business logic — avoid shallow UI-only wrappers.

## Key gotchas

- **`pnpm dev` does not run `prisma generate`** — run it manually if `src/generated/prisma` is missing.
- **`pnpm build` does** run `prisma generate` automatically.
- **ESLint rule:** no namespace imports from `lucide-react` or `@radix-ui/*` — use named imports only.
- **Email verification**: for local dev, manually set `emailVerified = true` in the DB if you can't receive Resend emails.
- **Usage UI**: plan usage caps and progress are in **Settings → Usage**, not `/home`. See `src/app/(private)/layout.tsx`, `src/lib/usage-summary.ts`, `src/components/dialog-settings.tsx`.
- **Serwist (PWA)**: service worker is disabled in `pnpm dev`. Use `pnpm build && pnpm start` to test install/offline behavior.
- **Stripe local dev**: run `stripe listen --forward-to localhost:3000/api/billing/webhook` and copy the CLI signing secret into `STRIPE_WEBHOOK_SECRET`.
- **`SUPABASE_SERVICE_ROLE_KEY`** is server-only. The browser uses only the anon key for Realtime.
- **All user-supplied URLs must go through `safeFetch`** — never raw `fetch` — to prevent SSRF.
- **Outbound proxy on Vercel**: optional `SAFE_OUTBOUND_HTTP_PROXY` for metadata fetches — see [`docs/production-outbound-proxy.md`](docs/production-outbound-proxy.md).

## CI

PRs target `develop` (default) then `main` for releases. Pipeline: setup → Prisma → lint + typecheck (parallel) → tests + build (parallel). Releases are manual (`workflow_dispatch`) and merge `develop` into `main`.
