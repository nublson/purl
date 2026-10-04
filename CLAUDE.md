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
pnpm exec playwright install chromium webkit   # one-time: browsers for the e2e tests
pnpm test:e2e                 # Playwright end-to-end tests (Chromium + WebKit)
pnpm test:e2e:ui              # Playwright UI mode
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
- Routes: `/folders/[slug]` page; `/api/folders` + `/api/folders/[id]` (app) and `/api/v1/folders` + `/api/v1/folders/[id]` (API key; same shapes and errors, `PATCH` update and `DELETE ?withLinks=`); `folderId` on the links endpoints (filter on GET, file on POST — a duplicate URL is moved and the response reports `moved`; `folderId` on app and v1 `PATCH /api/.../links/[id]` moves a link, `null` unfiles it). MCP: `list_folders`, `create_folder`, `update_folder`, `delete_folder` (`deleteLinks` opt-in), `move_link`, plus `folderId` on `save_link` / `list_saved_items`.
- **Bulk move/delete** (the selection bar): `PATCH /api/links/bulk` `{ ids, folderId }` (`null` unfiles) → `{ moved: [{ id, previousFolderId }], notFound }`, and `DELETE /api/links/bulk` `{ ids }` → `{ deleted }`; same on `/api/v1/links/bulk`, plus MCP `move_links`. Ids are deduped, capped at `MAX_BULK_LINK_IDS`, and other users' ids are skipped, not errors (parsing in `src/lib/bulk-links.ts`, writes in `moveLinksToFolder` / `deleteLinksForUser`). Client: `useFolderActions().moveLinks` (one toast, Undo puts each link back in its previous folder) and `deleteLinksWithUndo` (`src/lib/pending-link-deletes.ts`). Selection state lives in `src/lib/link-selection.ts` (`linkSelection.toggle(id, { shiftKey })`, `selectAll`, `clear`, `selectedIds`; `useSelectedLinkIds`, `useIsLinkSelected`); `HomeShell` registers the visible links in display order and clears the selection when the folder changes. UI: hovering a row (or long-pressing on touch) shows its checkbox; while anything is selected every row shows one, a row click toggles it (Shift for a range) and row menus hide. `LinkSelectionBar` (`src/components/link-selection-bar.tsx`) floats at the bottom: count (clears), Select all, Move (folders, "Remove from …", "New folder…" which creates quietly via `createFolder(input, { quiet: true })` and moves into it; icon-only below 23rem, where the full bar doesn't fit), Mark as read / unread, Delete; shortcuts in `src/lib/link-selection-shortcuts.ts` (Esc, ⌘/Ctrl+A, Delete/Backspace, M, R) shown in tooltips with `Kbd`.
- Each folder has an optional `emoji` (exactly one emoji grapheme, validated by `normalizeFolderEmoji`; invalid → 400 `INVALID_EMOJI`). `FolderSummary.emoji` is always set: the stored value or `DEFAULT_FOLDER_EMOJI` (🦪). Each folder also has an optional `description` (trimmed, ≤160 chars, `MAX_FOLDER_DESCRIPTION_LENGTH`; too long → 400 `INVALID_DESCRIPTION`), `null` in `FolderSummary` when unset. Create takes `{ name, emoji?, description? }`; `updateFolder` / `PATCH /api/folders/[id]` take `{ name?, emoji?, description? }` (`null` clears `emoji`/`description`).
- **Reading state:** `Link.readAt` (null = unread). Opening a link from its row (click, middle-click, or the menu's "Open in new tab") marks it read; the row menu toggles "Mark as read" / "Mark as unread", and the selection bar's button (or `R`) marks the selection read, or unread once every selected link is read (the selection stays). Icons come from `ReadToggleIcon` (`src/components/read-toggle-icon.tsx`): an open book with a check to mark read, a closed book to mark unread (books, not checkmarks: a check means selected here), in the menu, the selection bar and the swipe. Read rows stay in the list, faded back: regular-weight muted title and a grey, half-opacity favicon; the row link's name says "read". No filter. Saving a URL again makes it unread. API: `read: boolean` on app/v1 `PATCH /api/.../links/[id]` (marking read keeps an earlier `readAt`), `{ ids, read }` on app/v1 `PATCH /api/.../links/bulk` → `{ updated }` (`markLinksReadForUser`), MCP `mark_links_read`; `readAt` is in every serialized link, never on shared folders. Client: `src/lib/link-read-state.ts` (`setLinksRead` shows the change at once, sends one request at a time in order with `keepalive`, rolls back with a toast on failure; `HomeShell`'s reload settles confirmed changes).
- **Row swipe (phones only):** `LinkSwipeRow` (`src/components/link-swipe-row.tsx`) wraps each `LinkItem` when `useIsPhone()` (coarse pointer, under 768px) and nothing is selected. Swipe right past 72px and let go: toggles read (the indicator behind fills in once it would act). Swipe left: Delete (outer, at 40px) then Move (76px) appear, 32px rounded buttons like the row menu's, and the row rests open at -84px past halfway; while held (finger on it, or resting open) the whole component (row and buttons) gets a hairline ring drawn on top and the row the hover color made opaque, both fading in and out over 150ms; a tap on the row, a scroll, or swiping another row closes it (one open row, `src/lib/swipe-row.ts`). Position decides, not velocity. The row follows the finger via a Motion value (`touch-action: pan-y`, so vertical drags scroll); a gesture locks to an axis after 10px, captures the pointer, cancels the row's long-press (`onSwipeStart`), and swallows the click it produces; a long-press that selects the row mid-gesture ends the swipe. Events from portals (the Move menu) bubble through React, so the row ignores targets outside its own DOM. Rows don't start text selection on touch (`select-none` under `pointer: coarse`). On phones the row menu's "Move to folder" expands its folders in place under it instead of a side submenu (`LinkFolderItems`, shared with the swipe's Move). e2e: `e2e/link-swipe.spec.ts` (real touches via the DevTools protocol, Chromium only).
- **View mode (list or grid):** the user menu's Layout group, "View mode" (`ViewModeMenu`: a submenu with List / Grid, the current one checked; on phones it opens in place) sets how Home and folders show links, saved on the account (`User.linkView`, enum `LIST`/`GRID`, default list). The same group's "Folder tags" (`FolderTagsMenuItem`, a checkbox item drawn with a switch; the menu stays open) tags each link on Home with its folder (`FolderTag`: emoji and name; after the domain in rows, under it in cards with its emoji in the favicon's column; on phones only the emoji, a button above the link whose tap shows the name in a tooltip; `useFolderTag` returns null off Home, for unfiled links, or with tags off), saved as `User.showFolderTags` (default off). Both go through `PATCH /api/user/layout` `{ view?, folderTags? }` and `getLayoutForUser` (`src/lib/link-view-store.ts`, read fresh from the DB in the `(app)` layout, not the session cookie cache). Client: `LinkViewProvider` / `useLinkView` (`src/contexts/link-view-context.tsx`) changes them at once and saves, reverting with a toast on failure. The grid is the shared folder's, exactly: `LINK_GRID_COLUMNS` / `LINK_GRID_FRAME` (`src/lib/link-view.ts`), masonry (`src/components/masonry.tsx`: `useMasonry`, `MasonryItem`), and the card's frame and content (`LINK_CARD_FRAME`, `LinkCardContent` in `shared-link-card.tsx`). Day headings stay, lined up with the first column. The owner's card (`LinkCard`) adds the rows' actions: opening marks it read (read cards step back like read rows), a checkbox in the thumbnail's top-left corner (on hover, or always while selecting, when a click toggles the card; long-press on touch via `useLongPress`), and the row menu (`⋯`) in the top-right (on hover, always on touch). The page frame (`LinkViewFrame`) and `HomeSkeleton` follow the view. No swipe on cards. e2e: `e2e/owner-grid.spec.ts`; the fixtures reset the view to list and tags off before each test.
- **Search field** (`LinkOmnibox`, pinned to the bottom of Home and folder pages; phones save through it too): typing filters the list in place (`q` on `GET /api/links`, title/domain/URL, case-insensitive; a folder page searches that folder and offers "Search all links", which opens `/home?q=`). Input that looks like a URL (`omniboxSaveUrl` in `src/lib/omnibox.ts`: `http(s)://…`, or one word with a dot and a letters-only ending, not a file extension) also gets a Save row at the top of the list, drawn like a saved link (favicon, title, domain from `GET /api/links/preview?url=`, which resolves metadata without saving; rate-limited `link_preview`, 60/min per IP) with + where the menu would be; + or Enter saves it through the page's paste flow. `/` or ⌘/Ctrl+K focuses it. A fixed band of page background behind it (solid to the field's top, then fading) hides rows scrolling underneath. The selection bar stacks above it, and toasts are offset above it (`<Toaster offset>` in the root layout).
- **Add links** (folder pages): `AddLinksPopover` (`src/components/add-links-popover.tsx`, shadcn `Command`/cmdk) lists the 10 most recent links not in the folder and searches the rest (`GET /api/links/search?q=&notInFolderId=&limit=`, `searchLinksForUser`: title/domain/URL, case-insensitive, newest first, max `MAX_LINK_SEARCH_RESULTS`); clicking (or Enter) checks links, checks survive a new search, and "Add N links" (or ⌘/Ctrl+Enter) moves them in as one bulk move; the header's popover stays open, while the empty state's closes (adding removes the empty state, its anchor). It opens under the header's + button (`HeaderAddMenu`, `src/components/header-add-menu.tsx`: the "Add links" item or `A`) or on the folder empty state's button; which one is open lives in `src/lib/add-links-popover.ts`.
- **Row motion:** a deleted row fades out to the left, and Undo plays it back in (`"restoring"` phase in `pending-link-deletes.ts`). On a folder page, rows moved out of it get the same exit (`src/lib/leaving-links.ts`: the folder actions announce moves with `announceLinksMoved`; `HomeShell` marks the rows and its reload waits for the fade before dropping them).
- **Shared folders:** `Folder.isPublic` (off by default; set with `isPublic` on `PATCH /api/folders/[id]`, v1, or MCP `update_folder`) makes a folder readable by anyone at `/@username/slug`. Next can't have `@` directory segments, so `next.config.ts` rewrites `/@:username/:slug` to `src/app/(shared)/u/[username]/[slug]` (and redirects `/u/...` back to `/@...`). The proxy lets `/@`, `/u` and `/api/public` through without a session; the page and `GET /api/public/folders/[username]/[slug]?cursor=` (load more) are rate-limited per IP (`public_folder`). `getPublicFolderPage` (`src/lib/public-folders.ts`) returns only public fields (owner name/image/username; folder name/slug/emoji/description; link id/url/title/description/thumbnail/domain/favicon/contentType/createdAt); a private folder is indistinguishable from a missing one (404). Renames keep old URLs working: `folder_slug_redirects` (written by `updateFolder` when the slug changes) and `username_redirects` (written by `setUsername`); a live folder or username always wins over a redirect. Pages are `noindex`. Owners share from the header's Share button on a folder page (`FolderSharePopover`: "Share" with a lock while private, "Public" with a globe once shared; a Public switch and the link with a copy button, off while private); `publicFolderPath` lives in `src/lib/public-folder-path.ts` so the client can build the URL. The page looks exactly like the owner's folder page: the app header's frame with the folder (emoji, name) where the switcher would be and List / Grid view buttons on the right (`SharedFolderViewToggle`; the view lives in `SharedFolderViewProvider`, list by default, remembered per visitor in the `purl-shared-view` cookie so the server renders it, `src/lib/shared-folder-view.ts`). Above the links, the folder's description (one muted line, lined up with the rows or the grid's first column); and `SharedFolderFooter`, fixed at the bottom: "by [avatar] @username · Made with [logo] Purl" over the search field's background band (`BOTTOM_BAR_BAND` in `src/components/omnibox-shell.ts`, shared with `LinkOmnibox`). List: the owner's rows read-only (`SharedLinkItem`), one list newest first, no day headings, hover previews except PDFs. Grid: cards up to 210px in 2 / 3 / 4 columns (phone / md / lg) (`SharedLinkCard`: rounded, 16:10 thumbnail on top, then favicon, title (two lines) and domain; natural heights, masonry: 1px grid rows and each card spans its measured height, so short cards move up; 16px gutters (columns and rows alike) widening to 40px from md). Both load more as you scroll from the public endpoint (`SharedFolderList`; the grid shows a row of `SharedLinkCardSkeleton`s meanwhile, the list its dots). The page resolves the folder first (`resolvePublicFolder`), so 404s and 308 redirects keep their status, then streams the links (`listPublicFolderLinks`) behind `SharedFolderSkeleton` in the saved view. Link previews (Slack, X, iMessage) use `opengraph-image.tsx` next to the page (`generateImageMetadata` gives each folder its own alt text; it gets `params` as a Promise when the image route calls it): emoji, name (two lines, clamped), "by [avatar] @username", link count ("No links yet" when empty) and the Purl mark, and the 6 most recent links on the right as the grid view's cards (thumbnail or favicon/globe on a tint, favicon, title, domain) in a two-column masonry running off the edge (left side only for an empty folder); remote images go through `fetchImageAsDataUrl` (`src/lib/og-images.ts`: `safeFetch`, 6MB / 3s caps; PNG/JPEG/GIF drawn as is, WebP/AVIF converted to PNG and anything over 300KB scaled to 480px wide with `sharp`; inlined as data URLs), Inter is fetched once from jsDelivr, private/missing folders 404, an old (renamed) username or slug draws the current folder so previews posted before a rename keep their image, cached 5 minutes, rate-limited like the page. Don't add a route `loading.tsx` there: it streams a 200 before `notFound()` runs. Motion: on first load the cards arrive with `ARRIVE` 40ms apart (first 8; the list fades in at once), a loaded-more page's cards arrive together, a view switch fades the new layout in (150ms, opacity), and cards press to 0.98; cards remounted by a view switch don't re-arrive.
- **Folder shortcuts:** digit keys switch folders anywhere in the app (`1` = Home, then `2`–`9` and `0` for the first nine folders in menu order, i.e. by name), not while typing or with a dialog/menu open (the folder menu handles them itself). Rules in `src/lib/folder-shortcuts.ts`; the menu shows each row's key in a `Kbd` (the current row shows its check instead). Shared guards: `isTypingTarget` / `isOverlayOpen` in `src/lib/keyboard.ts`.
- The folder dialog's emoji picker is Frimousse (`src/components/ui/emoji-picker.tsx`); its emoji data loads from the jsDelivr CDN at runtime. Its footer's ✋ button opens the six skin tones (`useSkinTone`); the chosen tone applies to the grid and is remembered in `localStorage` (`purl:emoji-skin-tone`). Toned emoji are still one grapheme, so `normalizeFolderEmoji` accepts them. New folders suggest an emoji from the name until one is picked (`suggestFolderEmoji` in `src/lib/emoji-suggestion.ts`: a curated topic → emoji list, first matching word, simple plural/-ing forms; no network, no AI); the suggestion shows on the button, labelled "(suggested)", and is saved on create. Editing never suggests.
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

### End-to-end (Playwright)

`e2e/*.spec.ts`, run with `pnpm test:e2e` in Chromium and WebKit (not in CI); install the browsers once with `pnpm exec playwright install chromium webkit`. It reuses a running `pnpm dev` on :3000 or starts one, and loads `.env` + `.env.local` like the app. Each worker first checks the app accepts its test session, so a reused server running with a different database or auth secret fails fast with a clear error. The save test fetches `https://example.com`, so it needs network access.

- **Local database only.** `playwright.config.ts` refuses to run unless `DATABASE_URL` points at localhost: the tests create and delete users, folders and links.
- **Sign-in:** OAuth can't be automated, so `e2e/fixtures.ts` gives each worker its own `@purl.test` user (reserved domain, deleted afterwards) and signs the browser in with session cookies minted by a test-only Better Auth instance with the `testUtils` plugin (`e2e/support/auth.ts`, same DB, secret and base URL as the app). Nothing test-only ships in `src/lib/auth.ts`. Opt out per test with `test.use({ signedIn: false })`.
- **Seeding** goes through plain `pg` (`e2e/support/db.ts`), not the generated Prisma client, which Playwright's CommonJS loader can't load. Use the `seed` fixture (`seed.link`, `seed.folder`); every test starts with no links or folders.
- **Hydration:** pages are server-rendered, so a control can be clicked before React hydrates it. Call `waitForHydration(page, selector)` before interacting with client-only controls (menus, dialogs).

## Key gotchas

- **`pnpm dev` does not run `prisma generate`** — run it manually if `src/generated/prisma` is missing.
- **`pnpm build` does** run `prisma generate` automatically.
- **ESLint rule:** no namespace imports from `lucide-react` or `@radix-ui/*` — use named imports only.
- **Sign-in is Google/GitHub only** (Apple is enabled when its env vars exist); for local dev, create OAuth apps with localhost callbacks `http://localhost:3000/api/auth/callback/{google,github}`.
- **Usage UI**: the link count vs. the cap is in **Settings → Usage**, not `/home`. See `src/app/(private)/(app)/layout.tsx`, `src/lib/usage-summary.ts`, `src/components/dialog-settings.tsx`.
- **On-screen keyboard (iOS)**: iOS doesn't shrink the page for the keyboard; it scrolls the whole view up to reveal a focused field, which pushed the header off-screen. `KeyboardInset` (`src/components/keyboard-inset.tsx`, in the root layout) reads `visualViewport` and sets `--keyboard-inset` (layout height minus visible height; not minus `offsetTop`, which iOS sets to the same pan), sizes `<html>` to the visible area while it's open (`html[data-keyboard-open]`, `!important` to beat `h-full`) and scrolls the pan back. Things pinned to the bottom use `var(--bottom-inset)` (`max(safe area, keyboard)`, globals.css) instead of `env(safe-area-inset-bottom)`. The domain chip and ⌃ ⌄ ✓ bar above the keyboard are Safari's own UI and can't be removed from the page. Test it in the iOS Simulator's Safari at `localhost:3000` (Next's dev server blocks its scripts for `127.0.0.1`).
- **Refresh on return**: `HomeShell` reloads the list and folder counts when the tab becomes visible after `RETURN_REFRESH_AFTER_MS` (30s) hidden, since an installed iOS app's Realtime connection can drop while suspended. There is no pull-to-refresh.
- **Serwist (PWA)**: service worker is disabled in `pnpm dev`. Use `pnpm build && pnpm start` to test install/offline behavior.
- **`SUPABASE_SERVICE_ROLE_KEY`** is server-only. The browser uses only the anon key for Realtime.
- **All user-supplied URLs must go through `safeFetch`** — never raw `fetch` — to prevent SSRF.
- **Outbound proxy on Vercel**: optional `SAFE_OUTBOUND_HTTP_PROXY` for metadata fetches — see [`docs/production-outbound-proxy.md`](docs/production-outbound-proxy.md).

## CI

PRs target `develop` (default) then `main` for releases. Pipeline: setup → Prisma → lint + typecheck (parallel) → tests + build (parallel). Releases are manual (`workflow_dispatch`) and merge `develop` into `main`.

The release workflow runs `prisma migrate deploy` against production (secret `PRODUCTION_DATABASE_URL`, the Supabase **session pooler** URL on port 5432) after the build and before it publishes the `release/build-validation` status that gates the Vercel deploy. A failed migration fails the gate, so the new code never ships against an old schema. Keep migrations backward-compatible (additive), since the previous deploy keeps serving until the new one is live. Pending migrations that drop or delete data (`DROP`, `DELETE FROM`, `TRUNCATE`, column type changes) block the release unless it's started with `allow_destructive_migrations` (back up production first).
