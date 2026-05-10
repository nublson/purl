# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Purl

AI-powered read-it-later app and personal knowledge base. Users save URLs (web, PDF, YouTube, audio); Purl ingests the content, stores chunked text with pgvector embeddings, and answers questions over what was saved. **Anthropic Claude** handles streaming chat; **OpenAI** handles embeddings and Whisper transcription.

Plans: Free (limited) and Pro ($9/month). New signups get a 7-day Pro trial. Exact caps live in [`docs/commercial-model.md`](docs/commercial-model.md) — treat it as canonical when touching plan logic.

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
- `src/app/(private)/` — Authenticated app: `/home` (save links), `/ai` (chat interface)
- `src/app/api/` — API routes (links, chats, upload, billing, auth, admin, feedback)
- `src/app/sw.ts` — Serwist PWA service worker (compiled to `public/sw.js` on build; **disabled in dev**)
- `src/app/~offline/` — Static offline fallback page

### Core library (`src/lib/`)

Business logic. Key modules:

| Module | Purpose |
|--------|---------|
| `ingest-web.ts`, `ingest-pdf.ts`, `ingest-youtube.ts`, `ingest-audio.ts` | Content extraction pipeline |
| `links.ts` | Link CRUD, `scrapeLinkMetadata`, `prepareIngestForLink` |
| `server-detect-content-type.ts` | SSRF-safe HEAD/sniff to classify URL |
| `safe-outbound-fetch.ts` | SSRF-hardened fetch wrapper — **all outbound HTTP must go through this** |
| `chat.ts`, `chat-storage.ts`, `chats.ts` | AI chat with streaming + tool use |
| `semantic-search.ts`, `embeddings.ts` | pgvector search + OpenAI embeddings |
| `entitlements.ts`, `usage.ts`, `usage-summary.ts` | Plan enforcement and usage metering |
| `auth.ts`, `prisma.ts` | Better Auth and Prisma client singletons |
| `stripe.ts` | Stripe Checkout, Customer Portal, webhook handling |
| `realtime-broadcast.ts`, `notify-links-after-ingest.ts` | Supabase Realtime sync |
| `proxy-rate-limit.ts` | Optional Upstash Redis rate limiting (applied in `src/proxy.ts`) |

### Ingestion flow

Saving is **synchronous** through metadata + DB insert; heavy work is **async** via Next.js `after()`:

1. `POST /api/links` or `POST /api/upload` → `detectContentType` + `scrapeLinkMetadata`
2. Insert `Link` row with `ingestStatus: PENDING`
3. `after()` → `prepareIngestForLink` (plan check) → handler (`ingestWeb/Pdf/Youtube/Audio`)
4. Handler: set `PROCESSING` → extract text → chunk → OpenAI embeddings → upsert `LinkContent` with pgvector → `COMPLETED` or `FAILED`
5. `notifyLinksAfterIngest` → `broadcastLinksChanged` → Supabase Realtime → client refresh

Free accounts skip extraction (ingest status: `SKIPPED`, metadata only).

### Authentication & routing

- **Better Auth** (`src/lib/auth.ts`) — email/password sessions stored in Postgres
- **`src/proxy.ts`** — Next.js middleware that gates private routes, applies rate limiting, and (optionally) enforces email verification
- Session is resolved server-side in API routes: `auth.api.getSession({ headers: request.headers })`

### Components (`src/components/`)

- `ui/` — Radix UI + shadcn/ui base components
- `chat/` — Chat interface
- `ai-elements/` — AI chat UI primitives
- `animate-ui/` — Motion animations
- `skeletons/` — Loading states

### Database (Prisma + pgvector)

Key enums: `ContentType` (WEB, YOUTUBE, PDF, AUDIO), `IngestStatus` (PENDING, PROCESSING, COMPLETED, FAILED, SKIPPED), `PlanKey` (FREE, PRO, PRO_TRIAL), `MessageRole`.

Prisma client output: `src/generated/prisma` (gitignored — must be generated).

## Testing

Vitest, node environment. Test files: `src/**/*.test.ts`.

`src/vitest.setup.ts` handles three important mocks that must not be bypassed:
- Sets a dummy `DATABASE_URL` so Prisma modules load without a real DB
- Mocks `server-only` so server modules can be imported in tests
- Mocks `undici` fetch to respect `globalThis.fetch` stubs
- Mocks `node:dns/promises` to return a public IP (passes SSRF guards)

Test patterns: mock `globalThis.fetch`, mock Prisma client calls, mock Anthropic/OpenAI/Stripe clients. Tests focus on business logic — avoid shallow UI-only wrappers.

## Key gotchas

- **`pnpm dev` does not run `prisma generate`** — run it manually if `src/generated/prisma` is missing.
- **`pnpm build` does** run `prisma generate` automatically.
- **ESLint rule:** no namespace imports from `lucide-react` or `@radix-ui/*` — use named imports only.
- **The home page input bar** saves URLs; AI questions go through the chat interface (`/ai`), not the URL bar.
- **Email verification**: for local dev, manually set `emailVerified = true` in the DB if you can't receive Resend emails.
- **Usage UI**: plan usage caps and progress are in **Settings → Usage**, not `/home`. See `src/app/(private)/layout.tsx`, `src/lib/usage-summary.ts`, `src/components/dialog-settings.tsx`.
- **Serwist (PWA)**: service worker is disabled in `pnpm dev`. Use `pnpm build && pnpm start` to test install/offline behavior.
- **Stripe local dev**: run `stripe listen --forward-to localhost:3000/api/billing/webhook` and copy the CLI signing secret into `STRIPE_WEBHOOK_SECRET`.
- **`SUPABASE_SERVICE_ROLE_KEY`** is server-only. The browser uses only the anon key for Realtime.
- **All user-supplied URLs must go through `safeFetch`** — never raw `fetch` — to prevent SSRF.

## CI

PRs target `develop` (default) then `main` for releases. Pipeline: setup → Prisma → lint + typecheck (parallel) → tests + build (parallel). Releases are manual (`workflow_dispatch`) and merge `develop` into `main`.
