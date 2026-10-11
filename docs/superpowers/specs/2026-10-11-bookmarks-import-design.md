# Bookmarks Import — Design

## Problem

A new Purl account starts empty. People who already keep links somewhere else (a browser's bookmarks, Raindrop, an old Pocket export) have to re-save them one by one. Saving a link scrapes its page (seconds per link), so even a script over the existing save API would take many minutes for a few hundred bookmarks and would burn the save rate limit.

**Goal:** import a bookmarks file in one step — a browser bookmarks export (HTML), a Raindrop CSV or a Pocket CSV — keeping the file's folders and saved dates, in a few seconds, without breaking the 1,000-link cap or the 100-folder cap. Details that need a page scrape (thumbnails, descriptions) fill in afterwards, in the background.

## Decisions

Settled with the user during brainstorming:

- **Fast insert.** An imported link is created from what the file already has: URL, title, saved date and folder. Its favicon is the domain's default favicon (`getDefaultFaviconUrl`), it has no thumbnail or description, and its content type is guessed from the URL alone. No network is touched at import time.
- **Folders: one Purl folder per source folder**, named after it. Nested folders are flattened with their path (`Dev / Tools`), which is also how Raindrop already writes them. Links with no folder stay unfiled. Folders beyond the 100-folder cap, and the links in them, go in unfiled and are counted in the summary.
- **Top-up: a Vercel cron job**, alone (no nudge from the open tab). The project is on Vercel Pro, which allows once-per-minute crons (confirmed against the Vercel cron usage-and-pricing page). Crons run on production deployments only.
- **Architecture: parse in the browser, send chunks.** The page reads the file locally, normalizes it and POSTs chunks of at most 200 links to a new endpoint. The raw file is never uploaded.
- **Entry point: Settings → a new Import tab.**
- **Duplicates are skipped**, not refreshed or moved into folders.
- **Over the cap: newest first.** The file is sorted newest-first, so the cap cuts the oldest links.
- **Imported titles are kept** unless they're only a domain/URL fallback.
- **Tags, notes, favorites, highlights and read status are dropped** (Purl has none of them).
- **Pocket is supported but low priority**: as far as is known, Pocket shut down in July 2025, so its CSV can only come from an old export.

Out of scope: a Stop button or Undo for an import, importing several files at once, importing from a URL, a Home empty-state shortcut into the Import tab, an import endpoint in the v1 API or MCP, and any export feature.

## Findings from real exports

A Raindrop account was inspected with the user's permission (two CSVs downloaded, left in `~/Downloads`; none of the account's data is committed — fixtures use made-up rows in the same shape).

| | Single-collection export | Full-account backup (Settings → Backups → CSV) |
|---|---|---|
| Columns | `id,title,note,excerpt,url,tags,created,cover,highlights,favorite` | the same, plus `folder` after `url` |
| `folder` values | no column | `Unsorted`, `Reading List`, `Design Engineer / Artists` (nested = `Parent / Child`) |
| Dates | `2026-10-11T17:40:26.872Z` | same |
| Encoding | UTF-8, no BOM, LF endings | same |

A single-collection export has no folder information, so its links import unfiled and the preview says so. The HTML (Netscape bookmark file) and Pocket CSV formats were **not** verified against real files; their parsers follow the documented formats and are the main assumption to confirm.

## Architecture

```
file ──read in the browser──▶ parse + normalize ──▶ preview (no network)
                                       │
                          chunks of ≤200, newest first
                                       ▼
                       POST /api/links/import  (per chunk, one transaction)
                       validate · dedupe · cap · folders · createMany
                       links get needsMetadata = true
                                       │
                                       ▼
        Vercel cron, every minute: GET /api/cron/enrich-links
        claim ≤20 flagged links · scrape (5 at a time) · write details
```

### 1. Reading the file (`src/lib/import/`, browser, pure functions)

Every parser returns the same normalized item: `{ url: string; title: string; folder: string | null; createdAt: Date | null }`, where `folder` is already the final Purl folder name.

**Format detection** looks inside the file, not at its name:
- **Browser bookmarks (HTML):** the first 2 KB (case-insensitive) contain `netscape-bookmark-file` or `<dt><a href`.
- **Raindrop CSV:** the header row contains `url`, `title` and `created`, and either `folder` or `excerpt`. `folder` is optional.
- **Pocket CSV:** the header row contains `title`, `url` and `time_added`.
- Anything else: error "We couldn't recognize this file…".

**HTML reader.** A small hand-written tokenizer, not the browser DOM, so the same code runs in Vitest. It follows `<DL>`/`</DL>` nesting, `<H3>` folder names and `<A HREF … ADD_DATE>` links; tag names are case-insensitive, `<p>`/`<DD>` are ignored, inner tags in titles are stripped, and HTML entities (`&amp; &lt; &gt; &quot; &#39;`, numeric) are decoded. `ADD_DATE` is Unix seconds; a value above 1e11 is treated as milliseconds and above 1e14 as microseconds. Depth-1 folders flagged `PERSONAL_TOOLBAR_FOLDER="true"` or `UNFILED_BOOKMARKS_FOLDER="true"`, or named (case-insensitively) *Bookmarks bar, Bookmarks Toolbar, Bookmarks Menu, Other bookmarks, Mobile bookmarks, Favorites, Favourites, Favorites bar*, are dropped from the path, so links directly in them are unfiled.

**Raindrop.** Uses `title`, `url`, `folder`, `created`. `Unsorted` (or an empty/absent `folder`) means no folder. **Pocket.** Uses `title`, `url`, `time_added` (Unix seconds); no folders.

**CSV reader.** RFC 4180: quoted fields with commas and line breaks, doubled quotes, an optional UTF-8 BOM, CRLF or LF.

**Cleaning, for every format:**
- Keep only `http:` and `https:` URLs after `new URL()` parsing; everything else (`javascript:`, `place:`, `file:`, `chrome://`, `about:`, unparseable) is dropped and counted as `skipped`.
- Sort by `createdAt` descending (items without a date sort as "now"), stable on ties; then collapse duplicates by link key, keeping the first (newest).
- Folder names: segments joined with ` / `; empty segments dropped; over 60 characters → the last segment alone; still over 60 → truncated to 59 characters plus `…`; empty → `null`.
- A date before 2000-01-01 or after now is treated as missing.
- A file over 5 MB is refused before it is read.

The shared "same link" key (`linkUrlKey`) ignores the scheme, a leading `www.`, a trailing slash and host case. It moves out of `src/lib/omnibox.ts` (`isSameLinkUrl`) into `src/lib/link-url-key.ts` so the client and server use one rule; `isSameLinkUrl` keeps working.

### 2. Server import (`POST /api/links/import`)

**Request:** `{ links: [{ url: string, title: string, folder: string | null, createdAt: string | null }] }` — 1 to 200 links. Session-authenticated (`getSessionUser`). Rate limited by a new `links_import` bucket (30 requests per minute per IP), registered in `src/lib/upstash-rate-limit.ts` and `src/lib/proxy-rate-limit.ts` the way `/api/links` POST is.

**Errors:** 400 `INVALID_BODY` (not JSON, wrong shape, empty), 400 `TOO_MANY` (over 200), 401, 429 (rate limit). Reaching a cap is **not** an error: it is a 200 with counts.

**Service** `importLinksForUser(userId, items)` in `src/lib/import-links.ts` (`server-only`), one Prisma transaction per chunk:

1. Re-validate every item (the client is never trusted): URL `http(s)`, at most 2,048 characters; title trimmed and cut at 500, empty → the domain; folder trimmed, 1–60 characters or `null`; `createdAt` valid and between 2000-01-01 and now, else now. Invalid items are counted as `invalid`.
2. Take the folder lock (`pg_advisory_xact_lock(hashtext(userId))`, as `createFolder` does), then the links lock (`hashtext('links:' + userId)`, as `insertWithinSaveLimit` does), always in that order. Nothing else takes both, so there is no deadlock, and a concurrent single save cannot push the account over the cap.
3. Load the account's existing link URLs (at most 1,000) and drop incoming links whose `linkUrlKey` matches an existing link or an earlier link in the same chunk → `duplicates`. Existing links are left untouched.
4. Capacity: `remaining = MAX_SAVED_LINKS − count`. Insert at most `remaining` links in chunk order; the rest → `overLimit`, and the response carries `limitReached: true`.
5. Folders: load the account's folders once; match each wanted folder name case-insensitively against them; create the missing ones with `createFolderInTx` (below) while the account has fewer than `MAX_FOLDERS`, each with `suggestFolderEmoji(name)` or the default; for a name that can't be created, its links are inserted unfiled → `unfiledForFolderLimit`. Names created earlier in the same chunk are reused.
6. One `createMany` with, per link: `url`, `title`, `domain = getUrlDomain(url)`, `favicon = getDefaultFaviconUrl(domain)`, `description: null`, `thumbnail: null`, `contentType` from `guessContentType(url)`, `createdAt`, `folderId`, `userId`, `needsMetadata: true`.

`guessContentType` (`src/lib/guess-content-type.ts`, no network): `isYouTubeUrl` → `YOUTUBE`; a `.pdf` path → `PDF`; `.mp3 .m4a .wav .ogg .flac .aac` → `AUDIO`; otherwise `WEB`. The cron later replaces it with the sniffed type.

`createFolderInTx(tx, userId, name, emoji, description)` is extracted from `createFolder` (which then calls it inside its own transaction and lock). Behavior and tests of `createFolder` are unchanged.

**Response (200):** `{ imported, duplicates, invalid, overLimit, foldersCreated, unfiledForFolderLimit, limitReached }`. After a chunk that imported anything, `broadcastLinksChanged(userId, origin)` runs once.

Nothing here fetches a URL, so there is no new SSRF surface; URLs are only stored.

### 3. Background top-up (Vercel cron)

**Schema.** `Link.needsMetadata Boolean @default(false)` and `@@index([needsMetadata, createdAt])`. Migration `add_link_needs_metadata` (additive, so it passes the release workflow's destructive-migration check):

```sql
ALTER TABLE "links" ADD COLUMN "needsMetadata" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "links_needsMetadata_createdAt_idx" ON "links"("needsMetadata", "createdAt");
```

(A plain index rather than a partial one: Prisma can't express partial indexes and would report drift. The table is small.) Existing rows and normal saves are unaffected. The dev database gets the migration through `scripts/migrate-preview-db.mjs`, production through the release workflow.

**Schedule.** `vercel.json`: `"crons": [{ "path": "/api/cron/enrich-links", "schedule": "* * * * *" }]`. Vercel sends `Authorization: Bearer $CRON_SECRET` once `CRON_SECRET` is set in the Production environment variables. The route handler is `GET`, `runtime = "nodejs"`, `maxDuration = 120`.

**Auth.** Same shape as `src/app/api/notion/revalidate/route.ts`: Bearer header compared with `timingSafeEqual`. A missing `CRON_SECRET` → 503 and nothing runs; a missing or wrong header → 401. The proxy already lets `/api/*` through without a session; the route is secret-gated, so no rate limit.

**One run:**
1. Claim, atomically:
   ```sql
   UPDATE "links" SET "needsMetadata" = false
   WHERE "id" IN (
     SELECT "id" FROM "links" WHERE "needsMetadata" = true
     ORDER BY "createdAt" DESC LIMIT 20 FOR UPDATE SKIP LOCKED
   )
   RETURNING "id", "userId", "url", "title", "domain";
   ```
   Nothing flagged → respond `{ claimed: 0 }` immediately (an idle minute is one indexed query). Overlapping runs can't take the same link.
2. Look each claimed link up with the existing `resolveLinkFromUrl`, five at a time, each capped at 20 seconds.
3. Write by id: `description`, `thumbnail`, `favicon`, `domain`, `contentType`; `title` only when the stored title is empty or equals the raw URL or the domain. **`createdAt` is never touched** (`refreshExistingLink` bumps it to now, so it is not reused).
4. One `broadcastLinksChanged` per distinct affected account.
5. Respond `{ claimed, enriched, failed }`.

**Accepted trade-offs.** At-most-once: the flag is cleared at claim time, so a link whose lookup fails, or whose run crashes, keeps its file title, default favicon and no thumbnail (re-saving it refreshes it). No retry counters. Pace: 20 links a minute, so 500 links are filled in over about 25 minutes (`ENRICH_BATCH_SIZE` is one constant). Dev has no cron (crons run on production deployments only); trigger it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/enrich-links`.

### 4. The Import tab (`SettingsImport`)

Registered in `src/components/dialog-settings.tsx` as the `import` tab (between Integrations and Account; `SETTINGS_TAB_VALUES` and the dialog description updated). One component with four states.

1. **Choose a file.** A button plus a drop area (`accept=".html,.htm,.csv"`, a real `<input type="file">` behind a visible, keyboard-reachable button). Three how-to lines: browsers (bookmark manager → Export), Raindrop (Settings → Backups → CSV; the full backup includes folders, a single collection doesn't), Pocket (the CSV from your export). Under them: "Your file is read in your browser. Only the links, titles, folder names and dates are sent to Purl."
2. **Preview (no network).** Format found; "312 links in 14 folders"; "All 312 fit" or "You have room for 640 more, so the 312 newest are imported" (room from the Usage data the dialog already has); a note when non-web links were skipped; "This file has no folder information, so links go to Home" when there are no folders; a note when the file's folders exceed the room for new folders (links from the extra folders go to Home); a closed "See folders" list (name and count). Buttons: **Import**, **Choose another file**. The client trims the list to the room left before sending; the server still enforces the cap.
3. **Importing.** A progress bar (`role="progressbar"`, `aria-valuemin/max/now`, tabular-nums text "Importing 120 of 312") fed by `runImport`. Closing the dialog stops the loop; chunks already sent stay. The bar's width animation is disabled under reduced motion.
4. **Done.** "Imported 300 links into 12 folders", then the lines that apply — N already saved and skipped; N weren't web links; N over your limit; N links put on Home because of the folder limit — then "Thumbnails and details fill in over the next few minutes." Buttons: **View links** (closes the dialog and goes to `/home`), **Import another file**. The folder list is refreshed (`useFolders().refresh()`).

**Errors:** unrecognized file (names the supported formats); over 5 MB (before reading); no links found; 429 "Too many requests. Wait a minute and try again."; a network or server failure partway shows what was imported so far and **Try again** (safe: duplicates are skipped).

**Accessibility.** One polite status at the start and one at the end of an import (not one per chunk); focus moves to the preview heading after a file is read and to the summary when done; errors use `role="alert"`; drag-over is shown with text ("Drop to import"), not color alone; buttons go full width on phones. Copy is sentence case and plain. Components use `Typography`, Reicon (named imports) and the existing Button and Collapsible.

**Client modules.** `src/lib/import/run-import.ts` — `runImport(items, { onProgress, signal })` sends the chunks (with `linksOriginHeaders`), sums the responses, stops on `limitReached` or an error. `src/lib/import/import-summary.ts` — the preview and done wording. `src/components/settings-import.tsx` — the component.

## Files

New: `src/lib/import/` (parsers, `detect-format`, `parse-csv`, `parse-bookmarks-html`, `parse-raindrop-csv`, `parse-pocket-csv`, `normalize`, `run-import`, `import-summary`), `src/lib/link-url-key.ts`, `src/lib/guess-content-type.ts`, `src/lib/import-links.ts`, `src/app/api/links/import/route.ts`, `src/app/api/cron/enrich-links/route.ts`, `src/lib/enrich-links.ts`, `src/components/settings-import.tsx`, a migration, tests and fixtures.
Changed: `prisma/schema.prisma`, `src/lib/folders.ts` (`createFolderInTx`), `src/lib/omnibox.ts` (uses `linkUrlKey`), rate-limit files, `src/components/dialog-settings.tsx`, `vercel.json`, `.env.example`, `CLAUDE.md`.

## Testing

- **Parsers (Vitest, fixtures):** a Chrome-style and a Firefox-style HTML file (nested folders, root folders dropped, entities, `ADD_DATE` units), a Raindrop full backup and a single-collection export (made-up rows: a nested folder, `Unsorted`, a quoted title with a comma and a line break, accented characters, no BOM and with BOM, CRLF), a Pocket CSV; detection of each and of garbage; cleaning (non-web URLs, duplicates, sort, date clamp, folder-name rules, the 5 MB limit).
- **`importLinksForUser` (mocked Prisma, as the other server tests):** validation, duplicates against existing and within a chunk (`www`, slash, case), the capacity cut and `limitReached`, folder matching (case-insensitive), creation, the 100-folder cap, exact `createMany` fields, `guessContentType`.
- **Route:** 401, bad body, over 200, broadcast only when something was imported.
- **Cron:** 503 without a secret, 401 for a wrong one, 200 `{ claimed: 0 }` when idle; the worker with a mocked scraper keeps a file title, replaces a fallback title, leaves `createdAt` alone, survives one failure, never runs more than 5 at once, and broadcasts once per account.
- **`runImport` and `import-summary`:** chunking, summing, stopping, wording.
- **e2e (`e2e/import.spec.ts`):** no network needed. One fixture per format → preview text → import → the summary → Home shows the links under their original dates and the folder menu shows `Design Engineer / Artists`; a second import of the same file skips everything; an unsupported file shows the error; the cron route called with the e2e secret clears `needsMetadata`, keeps the imported title and leaves `createdAt` unchanged.

## Setup and rollout

1. Merge the migration with the code (additive; the build migrates dev, the release workflow migrates production).
2. Add `CRON_SECRET` to the Vercel **Production** environment variables (and to `.env.example` as documentation). Without it the cron route returns 503 and imported links simply keep their plain look.
3. After the first production deploy, check the Crons tab in the Vercel dashboard shows `/api/cron/enrich-links`.
4. `CLAUDE.md` gets a section covering the import, the cron, and the dev-trigger command.

## Risks and assumptions

- HTML (Safari, Firefox, Edge) and Pocket CSV formats are unverified against real files; fixtures follow the documented formats. A real file that breaks a parser is a bug to fix with a new fixture.
- Raindrop's single-collection export has no folders (verified); users must use the full backup to keep folders, and the UI says so.
- At-most-once enrichment and the 20-per-minute pace are deliberate (see above).
- Dev (`dev.purl.live`) never runs the cron on its own.
- Pocket may be rarely used; it is a small parser, kept for completeness.
