<p align="center">
  <img src="thumbnail.jpeg" alt="Purl — Save Anything. Keep what matters. A home for your links, PDFs, video, and audio." width="920" />
</p>

# Purl

**Save anything. Keep it in one place.**

**Live preview:** [https://purl.nublson.com](https://purl.nublson.com)

Purl is a read-it-later app — a home for your "pearls". You paste URLs: web pages, PDFs, YouTube videos, and audio. Purl resolves each item's metadata (title, favicon, description, thumbnail) and keeps everything in one place, available from the app, a REST API, and an MCP server.

Purl is free, with one limit: each account can save up to **1,000 links** (`MAX_SAVED_LINKS` in [`src/lib/limits.ts`](src/lib/limits.ts)).

The product goal: one place to stash material you care about.

## Implemented today

- **Marketing site** — Landing page (hero with a live preview), docs for the REST API and MCP server, privacy and terms.
- **Authentication** — Email/password (and related flows) via [Better Auth](https://www.better-auth.com/); optional email verification through [Resend](https://resend.com/).
- **Save & organize**
  - Add items by URL with automatic content-type detection (web, PDF, YouTube, audio).
  - Links grouped by relative time (e.g. Today, This Week, Last Month).
  - Preview metadata (title, description, favicon, thumbnail where available).
- **Hardened outbound fetch** — Server-side `safeFetch` with optional proxy/DNS controls (see `AGENTS.md`). An egress proxy can be configured via [`SAFE_OUTBOUND_HTTP_PROXY`](docs/production-outbound-proxy.md).
- **Realtime list sync** — Supabase Realtime so saves and updates propagate across tabs/devices quickly.
- **Link actions** — Open original, copy URL, edit metadata, delete.
- **REST API & MCP** — `/api/v1` and an MCP server (`save_link`, `list_saved_items`, `get_link`) with API-key or OAuth auth.
- **Operational extras** — Optional Upstash-backed API rate limiting, optional Sentry, Vitest coverage for critical paths.
- **PWA (installable app)** — [Web App Manifest](public/manifest.json) plus a [Serwist](https://serwist.pages.dev/) service worker ([`src/app/sw.ts`](src/app/sw.ts)) that builds to **`public/sw.js`** (generated on `pnpm build`, gitignored). Enables **Install** in Chrome/Edge and similar where the platform supports it, with runtime caching via Serwist's Next.js defaults and a static offline shell at [`/~offline`](src/app/~offline/page.tsx). **Serwist is disabled in `pnpm dev`** to avoid service-worker cache surprises during development — use **`pnpm build && pnpm start`** (or your production URL) to exercise installability and the SW.

## Save flow

Saving a link is fully **synchronous** — there is no background processing.

1. **Input** — `POST /api/links` with a URL (also `/api/v1/links` and the MCP `save_link` tool).
2. **Classify & decorate** — Server-side [`detectContentType`](src/lib/server-detect-content-type.ts) (SSRF-safe `HEAD` / sniff) plus [`scrapeLinkMetadata`](src/lib/links.ts) (Open Graph HTML, PDF `Content-Disposition` / size, YouTube oEmbed). Saving an existing URL again refreshes its metadata and moves it to the top.
3. **Persist** — A `Link` row with title, favicon, thumbnail, domain, and `contentType` (`WEB`, `PDF`, `YOUTUBE`, or `AUDIO`).
4. **Sync** — [`broadcastLinksChanged`](src/lib/realtime-broadcast.ts) notifies other tabs/devices via Supabase Realtime.

## Not implemented yet

These are called out explicitly because the repo is going public:

- **Settings breadth** — Settings include account deletion; broader account preferences (profile edits, password change, notification settings, etc.) are not implemented yet.

**Marketing vs. product:** The landing page copy mentions ideas such as **collections** and a **weekly digest**. Those are **not** built in the current schema or app — treat them as roadmap, not shipped features.

## Tech stack

- **Web:** Next.js (App Router), React, TypeScript
- **UI:** Tailwind CSS, shadcn/ui
- **Auth:** Better Auth
- **Database:** PostgreSQL + Prisma
- **Email (optional in dev):** Resend for verification emails
- **Realtime:** Supabase client (anon + service role on server)
- **PWA:** [Serwist](https://serwist.pages.dev/) (`@serwist/next`), web manifest + precache / offline fallback

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

Purl is built around **untrusted input** (arbitrary URLs). A few layers matter in production:

- **SSRF-aware outbound fetches** — User-supplied URLs are not passed to raw `fetch`. OG/thumbnail probes, PDF fetch, content-type sniffing, and similar paths go through [`safeFetch`](src/lib/safe-outbound-fetch.ts): HTTP(S) only, blocked private/link-local/reserved targets, redirect handling with per-hop host checks, DNS resolution pinned before connect (mitigates classic DNS rebinding against the pre-check), optional response size caps (e.g. PDF proxy). Optional **egress proxy** and custom DNS servers are documented in [`AGENTS.md`](AGENTS.md).
- **Authentication & route gating** — [Better Auth](https://www.better-auth.com/) sessions; Next.js [`proxy`](src/proxy.ts) redirects unauthenticated users away from private routes and can require **email verification** before app access.
- **API authorization** — Sensitive routes (`/api/links`, `/api/v1/*`, MCP, etc.) resolve the session server-side and scope work to the signed-in user.
- **Rate limiting** — When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, the proxy applies per-IP limits to **`/api/auth/*`**, **`POST /api/links`**, and **`POST /api/feedback`** (see [`proxy-rate-limit.ts`](src/lib/proxy-rate-limit.ts)). Without Upstash, limits are disabled — fine locally, not ideal for production.
- **Secrets & client exposure** — `SUPABASE_SERVICE_ROLE_KEY` and similar values are server-only. The browser uses the Supabase **anon** key for Realtime only; `.env` stays gitignored.
- **Response bounds** — PDF proxy streaming is size-capped (see `safe-outbound-fetch`); avatar uploads are size-limited.

**Reporting a vulnerability:** use [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) for this repository so details stay private until patched.

## Setup (local development)

### Prerequisites

- **Node.js:** recent LTS
- **Package manager:** `pnpm` (this repo includes `pnpm-lock.yaml`)
- **Postgres:** local or hosted (Supabase works well)

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment variables

Create a `.env` file in the repo root. See `.env.example` for the full list; minimum for core behavior:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"

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

**PWA / install:** With `pnpm dev`, the service worker is not active. After a production build, `public/sw.js` exists locally; run **`pnpm start`** and open the app in Chromium to use **Install** or to test offline navigation to `/~offline`.

## Testing

Tests use [Vitest](https://vitest.dev/) and focus on critical logic (formatters, link grouping, auth routing, API behavior, metadata scraping). They intentionally avoid shallow UI-only wrappers.

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
