<p align="center">
  <img src="thumbnail.jpeg" alt="Purl — Save Anything. Understand it deeply. Personal knowledge base for links, PDFs, video, and audio." width="920" />
</p>

# Purl

**Save anything. Ask questions. Get answers.**

Purl is an AI-powered read-it-later app and personal knowledge base. You paste URLs (or upload files): web pages, PDFs, YouTube videos, and audio. Purl ingests the content, stores chunked text with vector embeddings, and answers questions by searching what you saved—optionally scoped with `@` mentions to specific items.

The product goal: one place to stash material you care about, then query it later with citations instead of digging through bookmarks.

## Implemented today

- **Marketing site** — Landing page with hero, features, supported content types, pricing section, and FAQ.
- **Authentication** — Email/password (and related flows) via [Better Auth](https://www.better-auth.com/); optional email verification through [Resend](https://resend.com/).
- **Save & organize**
  - Add items by URL with automatic content-type detection (web, PDF, YouTube, audio).
  - **File upload** for PDF and audio (size limits enforced server-side).
  - Links grouped by relative time (e.g. Today, This Week, Last Month).
  - Preview metadata (title, description, favicon, thumbnail where available).
- **Ingestion pipeline** — Fetches or extracts text (including transcripts for YouTube/audio), chunks it, embeds with OpenAI, stores in Postgres with **pgvector**; tracks per-link ingest status (pending, processing, completed, failed, skipped for edge cases like heavy SPAs).
- **Hardened outbound fetch** — Server-side `safeFetch` with optional proxy/DNS controls (see `AGENTS.md`).
- **Realtime list sync** — Supabase Realtime so saves and updates propagate across tabs/devices quickly.
- **AI chat**
  - Streaming replies with tool use: list saved items (filters by date/type) and **semantic search** over stored chunks.
  - **`@` mentions** to focus the model on specific saved links; mentions persist on messages.
  - Multiple chats, titles, and message history stored in the database.
- **Link actions** — Open original, copy URL, edit metadata, re-ingest, delete, add to chat context from the list.
- **Operational extras** — Optional Upstash-backed API rate limiting, optional Sentry, Vitest coverage for critical paths.

## Not implemented yet

These are called out explicitly because the repo is going public:

- **Settings** — The user menu includes a Settings item; it is **disabled** (no settings surface yet).
- **Feedback** — “Share feedback” is a **disabled** placeholder (no form, email capture, or ticketing integration).
- **Subscriptions / billing** — Landing pricing is **not** connected to payments. The “Upgrade” menu item is **disabled**; there is no Stripe (or other) subscription integration, plan enforcement, or usage limits tied to a paid tier.

**Marketing vs. product:** The landing page copy mentions ideas such as **collections** and a **weekly digest**. Those are **not** built in the current schema or app—treat them as roadmap, not shipped features.

## Tech stack

- **Web:** Next.js (App Router), React, TypeScript  
- **UI:** Tailwind CSS, shadcn/ui  
- **Auth:** Better Auth  
- **Database:** PostgreSQL + Prisma (with vector column for embeddings)  
- **AI:** OpenAI (chat + embeddings) via the Vercel AI SDK  
- **Email (optional in dev):** Resend for verification emails  
- **Realtime:** Supabase client (anon + service role on server)

## CI / GitHub Actions

Automation lives under [`.github/workflows/`](.github/workflows/). Every PR and manual release is gated by these pipelines.

### PR checks — [`pr-checks.yml`](.github/workflows/pr-checks.yml)

Runs on **`pull_request`** to **`develop`** and **`main`**: **Setup & validation** → **Prisma** (generate client + type fixes) → **Lint** and **type check** (in parallel) → **Tests** and **production build** (in parallel, after lint and type check pass). Concurrency is per-PR so new pushes cancel stale runs.

<p align="center">
  <img src="prCheckPipeline.png" alt="GitHub Actions graph for pr-checks.yml: Setup, Prisma, Lint & Type Check, Test & Build" width="920" />
</p>

### Release — [`release.yml`](.github/workflows/release.yml)

Runs on **`workflow_dispatch`** (manual): **Merge `develop` into `main`**, then **build validation** so production is only promoted after a green build.

<p align="center">
  <img src="releasePipeline.png" alt="GitHub Actions graph for release.yml: merge develop into main, then build validation" width="920" />
</p>

## Security

Purl is built around **untrusted input** (arbitrary URLs and uploaded files). A few layers matter in production:

- **SSRF-aware outbound fetches** — User-supplied URLs are not passed to raw `fetch`. Ingest, OG/thumbnail probes, PDF fetch, content-type sniffing, and similar paths go through [`safeFetch`](src/lib/safe-outbound-fetch.ts): HTTP(S) only, blocked private/link-local/reserved targets, redirect handling with per-hop host checks, DNS resolution pinned before connect (mitigates classic DNS rebinding against the pre-check), optional response size caps (e.g. PDF proxy). Optional **egress proxy** and custom DNS servers are documented in [`AGENTS.md`](AGENTS.md).
- **Authentication & route gating** — [Better Auth](https://www.better-auth.com/) sessions; Next.js [`proxy`](src/proxy.ts) redirects unauthenticated users away from private routes and can require **email verification** before app access.
- **API authorization** — Sensitive routes (`/api/chat`, `/api/links`, `/api/upload`, chats, etc.) resolve the session server-side and scope work to the signed-in user (e.g. chat mention IDs are validated against ownership).
- **Rate limiting** — When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, the proxy applies per-IP limits to **`/api/auth/*`**, **`POST /api/chat`**, **`POST /api/links`**, and **`POST /api/upload`** (see [`proxy-rate-limit.ts`](src/lib/proxy-rate-limit.ts)). Without Upstash, limits are disabled—fine locally, not ideal for production.
- **Secrets & client exposure** — `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and similar values are **server-only**. The browser uses the Supabase **anon** key for Realtime only; `.env` stays gitignored.
- **Upload bounds** — Audio uploads enforce a maximum size server-side; PDF proxy streaming is capped (see `safe-outbound-fetch` / upload limits in code).

**Reporting a vulnerability:** use [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) for this repository so details stay private until patched.

## Setup (local development)

### Prerequisites

- **Node.js:** recent LTS  
- **Package manager:** `pnpm` (this repo includes `pnpm-lock.yaml`)  
- **Postgres:** local or hosted (Supabase works well with pgvector)

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment variables

Create a `.env` file in the repo root. See `.env.example` for the full list; minimum for core behavior:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
OPENAI_API_KEY="sk-..."

# Supabase Realtime — cross-device instant link list sync (same project as Postgres)
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Optional (used for email verification on signup)
RESEND_API_KEY="re_..."
RESEND_FROM="Purl <onboarding@resend.dev>"
```

Notes:

- **`DATABASE_URL`** is required (Prisma + Better Auth).
- **Supabase** env vars are required for realtime link list sync. Use **Project Settings → API** in the Supabase dashboard. The service role key must stay server-only.
- **Resend** is optional for local dev: if `RESEND_API_KEY` is not set, signup can still work, but verification emails will not send.
- **Better Auth** secrets and URLs are in `.env.example` — copy those keys for a working auth setup.

### 3) Run database migrations

```bash
pnpm prisma migrate dev
```

### 4) Generate Prisma client (if needed)

```bash
pnpm prisma generate
```

### 5) Start the dev server

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Testing

Tests use [Vitest](https://vitest.dev/) and focus on critical logic (formatters, link grouping, auth routing, API behavior). They intentionally avoid shallow UI-only wrappers.

```bash
pnpm test        # run once
pnpm test:watch  # watch mode
```

## Useful commands

```bash
pnpm lint
pnpm build
pnpm start
pnpm test
```

More contributor notes (Prisma, Sentry, outbound proxy env): see [`AGENTS.md`](AGENTS.md).
