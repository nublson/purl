<p align="center">
  <img src="thumbnail.jpeg" alt="Purl — Save Anything. Understand it deeply. Personal knowledge base for links, PDFs, video, and audio." width="920" />
</p>

# Purl

**Save anything. Ask questions. Get answers.**

**Live preview:** [https://purl.nublson.com](https://purl.nublson.com)

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
- **PWA (installable app)** — [Web App Manifest](public/manifest.json) plus a [Serwist](https://serwist.pages.dev/) service worker ([`src/app/sw.ts`](src/app/sw.ts)) that builds to **`public/sw.js`** (generated on `pnpm build`, gitignored). Enables **Install** in Chrome/Edge and similar where the platform supports it, with runtime caching via Serwist’s Next.js defaults and a static offline shell at [`/~offline`](src/app/~offline/page.tsx). **Serwist is disabled in `pnpm dev`** to avoid service-worker cache surprises during development—use **`pnpm build && pnpm start`** (or your production URL) to exercise installability and the SW.

## Ingestion flow

Saving a link is **synchronous** through metadata resolution and the database row; **heavy work runs afterward** so the API can return quickly.

1. **Input** — `POST /api/links` with a URL, or `POST /api/upload` with a PDF/audio file (files go to Supabase Storage; the `Link` stores the public URL).
2. **Classify & decorate** — Server-side [`detectContentType`](src/lib/server-detect-content-type.ts) (SSRF-safe `HEAD` / sniff) plus [`scrapeLinkMetadata`](src/lib/links.ts) (Open Graph HTML, PDF `Content-Disposition` / size, YouTube oEmbed). Duplicates of the same URL **refresh** metadata and reset ingestion.
3. **Persist** — A `Link` row is created (default **`PENDING`**) with title, favicon, thumbnail, domain, and `contentType` (`WEB`, `PDF`, `YOUTUBE`, or `AUDIO`).
4. **Schedule** — [`dispatchIngest`](src/lib/links.ts) uses Next.js [`after()`](https://nextjs.org/docs/app/api-reference/functions/after) to run the right handler without blocking the response: [`ingestWeb`](src/lib/ingest-web.ts), [`ingestPdf`](src/lib/ingest-pdf.ts), [`ingestYoutube`](src/lib/ingest-youtube.ts), or [`ingestAudio`](src/lib/ingest-audio.ts).
5. **Pipeline** (each handler) — Set **`PROCESSING`** → fetch or extract plain text → split into chunks (with a synthetic **metadata** chunk first) → **OpenAI** embeddings → replace `LinkContent` rows and attach **pgvector** values → **`COMPLETED`**. Failures become **`FAILED`**. **Re-ingest** reuses the same pipeline without re-scraping listing metadata.

**Web pages (`WEB`).** Article-style HTML is fetched with [`safeFetch`](src/lib/safe-outbound-fetch.ts), parsed in **jsdom**, and the main content is extracted with Mozilla’s [**Readability**](https://github.com/mozilla/readability) ([`scrapeWebContent`](src/lib/web-scraper.ts)). That matches how Firefox’s reader mode chooses “the article,” but it is **not universal**: many **SPAs** and other **client-rendered** sites return a thin HTML shell to crawlers, so Readability finds little or nothing and ingest may **`FAIL`**. A small set of hosts that need a full browser are rejected early (`UnsupportedSpaError` → ingest **`SKIPPED`**).

Realtime subscribers get updates when ingestion finishes via [`notifyLinksAfterIngest`](src/lib/notify-links-after-ingest.ts) (which calls [`broadcastLinksChanged`](src/lib/realtime-broadcast.ts)).

```mermaid
flowchart TB
  subgraph save["Save path (responds to client)"]
    A(["URL or file upload"]) --> B["/api/links or /api/upload"]
    B --> C["detectContentType + scrapeLinkMetadata (safeFetch)"]
    C --> D["Insert Link — ingestStatus PENDING"]
    D --> E["after() → dispatchIngest by contentType"]
  end

  subgraph work["Background ingest"]
    E --> F["ingestStatus PROCESSING"]
    F --> G{"Extract text"}
    G --> W["WEB — jsdom + Mozilla Readability"]
    G --> P["PDF — page text"]
    G --> Y["YOUTUBE — transcript"]
    G --> A2["AUDIO — transcription"]
    W --> H["Chunk + metadata header"]
    P --> H
    Y --> H
    A2 --> H
    H --> I["OpenAI embeddings"]
    I --> J["Write LinkContent + pgvector"]
    J --> K{"Outcome"}
    K --> K1["COMPLETED"]
    K --> K2["FAILED"]
    K --> K3["SKIPPED (known SPA hosts)"]
  end

  K1 --> R["Realtime: list refresh"]
  K2 --> R
  K3 --> R
```

## Not implemented yet

These are called out explicitly because the repo is going public:

- **Settings** — The user menu includes a Settings item; it is **disabled** (no settings surface yet).
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

**PWA / install:** With `pnpm dev`, the service worker is not active. After a production build, `public/sw.js` exists locally; run **`pnpm start`** and open the app in Chromium to use **Install** or to test offline navigation to `/~offline`.

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
