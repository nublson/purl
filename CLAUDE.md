# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Purl

Read-it-later app: a home for your "pearls". Users save URLs (web, PDF, YouTube, audio); Purl resolves metadata (title, favicon, description, thumbnail) and keeps them in one place. There is no AI layer: the in-app chat and the extraction/embeddings/semantic-search pipeline were removed. `/ai` and `/chat/*` redirect to `/home` via `redirects()` in `next.config.ts`.

No paid plans: every account gets the same **1,000-link cap** (`MAX_SAVED_LINKS` in `src/lib/limits.ts`, enforced by `assertCanSaveLink` in `src/lib/entitlements.ts`; API/MCP return `403` with `code: LIMIT_REACHED`, `feature: SAVE_LIMIT`).

## Commands

```bash
pnpm install                  # install deps
pnpm prisma generate          # generate Prisma client (required before pnpm dev if src/generated/prisma is missing)
pnpm prisma migrate dev       # run DB migrations locally
pnpm dev                      # dev server on port 3000
pnpm build                    # prisma generate + next build
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

- `src/app/(public)/` — Marketing site (landing page with Google/GitHub sign-in)
- `src/app/(private)/` — Authenticated app: `/home` (save links), `/folders/[slug]` (one folder's links)
- `src/app/api/` — API routes (links, folders, auth, feedback, user, v1, MCP, pdf-proxy)
- `src/app/sw.ts` — Serwist PWA service worker (compiled to `public/sw.js` on build; **disabled in dev**)
- `src/app/~offline/` — Static offline fallback page

### Core library (`src/lib/`)

Business logic. Key modules:

| Module | Purpose |
|--------|---------|
| `links.ts` | Link CRUD, `scrapeLinkMetadata`, `resolveLinkFromUrl` |
| `server-detect-content-type.ts` | SSRF-safe HEAD/sniff to classify URL |
| `safe-outbound-fetch.ts` | SSRF-hardened fetch wrapper — **all outbound HTTP must go through this** |
| `folders.ts` | Folder CRUD, slugs, `FolderSummary`, folder cap (`MAX_FOLDERS`) and ownership checks |
| `folder-errors.ts` | `mapFolderError` — shared folder error → HTTP response mapping for `/api/folders` and `/api/v1/folders` |
| `limits.ts`, `entitlements.ts`, `usage-summary.ts` | Flat save cap and the Settings → Usage link count |
| `auth.ts`, `prisma.ts` | Better Auth and Prisma client singletons |
| `usernames.ts` | Username validation/generation rules, changed only via `PATCH /api/user/username` |
| `realtime-broadcast.ts` | Supabase Realtime sync |
| `proxy-rate-limit.ts` | Optional Upstash Redis rate limiting (applied in `src/proxy.ts`) |

### Save flow

Saving is fully **synchronous**; there is no background processing:

1. `POST /api/links` (or v1 API / MCP `save_link`) → `assertCanSaveLink` → `detectContentType` + `scrapeLinkMetadata`
2. Insert (or refresh, for a duplicate URL) the `Link` row
3. `broadcastLinksChanged` → Supabase Realtime → client refresh

### Folders

- A link belongs to at most one folder: `Folder` model, `Link.folderId` (`onDelete: SetNull`, so deleting a folder unfiles its links unless deleted `withLinks`). Cap: `MAX_FOLDERS = 100` (`src/lib/limits.ts`).
- Routes: `/folders/[slug]` page; `/api/folders` + `/api/folders/[id]` (app) and `/api/v1/folders` (API key); `folderId` on the links endpoints (filter on GET, file on POST — a duplicate URL is moved and the response reports `moved`; `folderId: null` on app `PATCH /api/links/[id]` unfiles); MCP `list_folders`, plus `folderId` on `save_link` / `list_saved_items`.
- Each folder has an optional `emoji` (exactly one emoji grapheme, validated by `normalizeFolderEmoji`; invalid → 400 `INVALID_EMOJI`). `FolderSummary.emoji` is always set: the stored value or `DEFAULT_FOLDER_EMOJI` (🦪). Each folder also has an optional `description` (trimmed, ≤160 chars, `MAX_FOLDER_DESCRIPTION_LENGTH`; too long → 400 `INVALID_DESCRIPTION`), `null` in `FolderSummary` when unset. Create takes `{ name, emoji?, description? }`; `updateFolder` / `PATCH /api/folders/[id]` take `{ name?, emoji?, description? }` (`null` clears `emoji`/`description`).
- The folder dialog's emoji picker is Frimousse (`src/components/ui/emoji-picker.tsx`); its emoji data loads from the jsDelivr CDN at runtime.
- Client folder state comes only from `FoldersProvider` (`src/contexts/folders-context.tsx`) via `src/hooks/use-folders.ts` (`useFolders`, `useCurrentFolder`, `useFolderActions`). The current folder is resolved by the folder page (server-side, handed down through `CurrentFolderProvider`), so saves there file by folder id.

### Authentication & routing

- **Better Auth** (`src/lib/auth.ts`) — sign-in is Google/GitHub OAuth only (Apple is enabled when its env vars exist), sessions stored in Postgres
- **`src/proxy.ts`** — Next.js middleware that gates private routes and applies rate limiting
- Session is resolved server-side in API routes: `auth.api.getSession({ headers: request.headers })`
- Every user has a unique `username` (rules in `src/lib/usernames.ts`), changed only via `PATCH /api/user/username`

### Components (`src/components/`)

- `ui/` — Radix UI + shadcn/ui base components
- `animate-ui/` — Motion animations
- `skeletons/` — Loading states

### Database (Prisma)

Key enum: `ContentType` (WEB, YOUTUBE, PDF, AUDIO).

Prisma client output: `src/generated/prisma` (gitignored — must be generated).

## Testing

Vitest, node environment. Test files: `src/**/*.test.ts`.

`src/vitest.setup.ts` handles three important mocks that must not be bypassed:
- Sets a dummy `DATABASE_URL` so Prisma modules load without a real DB
- Mocks `server-only` so server modules can be imported in tests
- Mocks `undici` fetch to respect `globalThis.fetch` stubs
- Mocks `node:dns/promises` to return a public IP (passes SSRF guards)

Test patterns: mock `globalThis.fetch`, mock Prisma client calls, mock Supabase clients. Tests focus on business logic — avoid shallow UI-only wrappers.

## Key gotchas

- **`pnpm dev` does not run `prisma generate`** — run it manually if `src/generated/prisma` is missing.
- **`pnpm build` does** run `prisma generate` automatically.
- **ESLint rule:** no namespace imports from `lucide-react` or `@radix-ui/*` — use named imports only.
- **Sign-in is Google/GitHub only** (Apple is enabled when its env vars exist); for local dev, create OAuth apps with localhost callbacks `http://localhost:3000/api/auth/callback/{google,github}`.
- **Usage UI**: the link count vs. the cap is in **Settings → Usage**, not `/home`. See `src/app/(private)/(app)/layout.tsx`, `src/lib/usage-summary.ts`, `src/components/dialog-settings.tsx`.
- **Serwist (PWA)**: service worker is disabled in `pnpm dev`. Use `pnpm build && pnpm start` to test install/offline behavior.
- **`SUPABASE_SERVICE_ROLE_KEY`** is server-only. The browser uses only the anon key for Realtime.
- **All user-supplied URLs must go through `safeFetch`** — never raw `fetch` — to prevent SSRF.
- **Outbound proxy on Vercel**: optional `SAFE_OUTBOUND_HTTP_PROXY` for metadata fetches — see [`docs/production-outbound-proxy.md`](docs/production-outbound-proxy.md).

## CI

PRs target `develop` (default) then `main` for releases. Pipeline: setup → Prisma → lint + typecheck (parallel) → tests + build (parallel). Releases are manual (`workflow_dispatch`) and merge `develop` into `main`.

The release workflow runs `prisma migrate deploy` against production (secret `PRODUCTION_DATABASE_URL`, the Supabase **session pooler** URL on port 5432) after the build and before it publishes the `release/build-validation` status that gates the Vercel deploy. A failed migration fails the gate, so the new code never ships against an old schema. Keep migrations backward-compatible (additive), since the previous deploy keeps serving until the new one is live.
