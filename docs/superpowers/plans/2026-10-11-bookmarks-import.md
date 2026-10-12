# Bookmarks Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import a browser bookmarks file (HTML), a Raindrop CSV or a Pocket CSV in one step, keeping the file's folders and saved dates, with page details filled in afterwards by a cron job.

**Architecture:** The browser reads and normalizes the file (pure parsers), shows a preview, then POSTs chunks of at most 200 links to `POST /api/links/import`, which dedupes, applies the caps, resolves folders and bulk-inserts links flagged `needsMetadata` with no network access. A Vercel cron (`GET /api/cron/enrich-links`, every minute) claims flagged links, scrapes them through the existing `resolveLinkFromUrl` and writes the details back.

**Tech Stack:** Next.js App Router, TypeScript, Prisma (Postgres), Vitest, Playwright, Vercel Cron.

**Spec:** [`docs/superpowers/specs/2026-10-11-bookmarks-import-design.md`](../specs/2026-10-11-bookmarks-import-design.md)

## Global Constraints

- Caps: `MAX_SAVED_LINKS` = 1,000 per account; `MAX_FOLDERS` = 100; folder name at most 60 characters (measured as `.length`, like `validateFolderName`); at most 200 links per import request (`MAX_IMPORT_CHUNK`); import files at most 5 MB (`MAX_IMPORT_FILE_BYTES`).
- Server validation of every incoming link: `http(s)` URL of at most 2,048 characters; title trimmed and cut at 500, empty → the domain (`getUrlDomain`); `createdAt` valid and between 2000-01-01 and now, otherwise now.
- Folder naming: nested paths are joined with ` / `; over 60 characters → the last segment alone; still over → truncated to fit with a trailing `…`, never splitting a surrogate pair.
- The import path makes **no outbound HTTP**; URLs are only stored. All fetching stays in `resolveLinkFromUrl` (SSRF-safe `safeFetch`).
- Locks: the import transaction takes the folder lock `pg_advisory_xact_lock(hashtext(userId))` first, then the links lock `hashtext('links:' + userId)`, always in that order.
- Cron: `GET /api/cron/enrich-links`, schedule `* * * * *`, `maxDuration = 120`, batch 20, concurrency 5, 20 s per link, `Authorization: Bearer $CRON_SECRET` compared with `timingSafeEqual`; the worker **never writes `createdAt`**.
- Rate limit: new `links_import` bucket, 30 requests per minute per IP.
- Repo rules (`CLAUDE.md`): render text elements through the `Typography` component; Reicon icons with **named imports only** (no namespace imports of `reicon-react` or `@radix-ui/*`); migrations must be additive; never commit to `develop` (work on `claude/bookmarks-import`); do not open a PR until asked.
- Every task ends with `pnpm typecheck`, `pnpm lint` (no new warnings) and its own tests green before its commit. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but that are easy to miss; each has a test in the named task.

1. **Re-importing a file whose links are all already saved** → "0 imported, N already saved", no error and no empty `createMany` (Task 7, Task 10, Task 12).
2. **Hostile or oversized values reaching the endpoint directly** (a 2,049-character URL, `javascript:` URLs, a 600-character title, 201 links) → counted as `invalid` or rejected with 400, never a 500 (Task 7, Task 8).
3. **Folder names that differ only by case, spacing or length/emoji** (`Dev` vs ` dev `, a 70-character name with an emoji) → one folder, no `FolderNameError`, no lone surrogate (Task 2, Task 7).
4. **Double-clicking Import or two imports at once** → links are not duplicated and the second click does nothing (Task 7 duplicate handling, Task 11 button guard, Task 12 e2e).
5. **Garbage dates** (`ADD_DATE="0"`, a negative or future timestamp, an unparseable Raindrop `created`) → treated as "no date" (imported with the current time), never an exception or an `Invalid Date` row (Tasks 2, 3, 4).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/link-url-key.ts` | `linkUrlKey`: the one "same link" rule (client + server) |
| `src/lib/guess-content-type.ts` | URL-only content-type guess |
| `src/lib/limits.ts` (modify) | import and folder-name constants |
| `src/lib/import/types.ts` | wire and parser types |
| `src/lib/import/parse-csv.ts`, `normalize.ts` | CSV reader; folder-name and item cleaning |
| `src/lib/import/parse-raindrop-csv.ts`, `parse-pocket-csv.ts`, `parse-bookmarks-html.ts` | the three format parsers |
| `src/lib/import/detect-format.ts`, `index.ts` | format detection; `parseImportFile` entry point |
| `src/lib/import/run-import.ts`, `import-summary.ts` | chunk sender; preview/done wording |
| `src/lib/folders.ts` (modify) | extract `createFolderInTx` |
| `prisma/schema.prisma` + migration | `Link.needsMetadata` and its index |
| `src/lib/import-links.ts` | server bulk import service |
| `src/lib/import-body.ts`, `src/app/api/links/import/route.ts` | request parsing and the endpoint |
| `src/lib/upstash-rate-limit.ts`, `src/lib/proxy-rate-limit.ts` (modify) | `links_import` bucket |
| `src/lib/enrich-links.ts`, `src/app/api/cron/enrich-links/route.ts`, `vercel.json` | cron worker and route |
| `src/components/settings-import.tsx`, `settings-content.tsx`, `dialog-settings.tsx` | the Import tab |
| `e2e/import.spec.ts`, `e2e/fixtures/import/*` | e2e and made-up fixtures |

---

### Task 1: Shared URL key and content-type guess

**Files:**
- Create: `src/lib/link-url-key.ts`, `src/lib/link-url-key.test.ts`, `src/lib/guess-content-type.ts`, `src/lib/guess-content-type.test.ts`
- Modify: `src/lib/omnibox.ts` (`isSameLinkUrl`)

**Interfaces:**
- Produces: `linkUrlKey(url: string): string`; `type GuessedContentType = "WEB" | "YOUTUBE" | "PDF" | "AUDIO"`; `guessContentType(url: string): GuessedContentType`; `isSameLinkUrl(a, b)` keeps its signature and behavior.

- [ ] **Step 1: Write failing tests.** `link-url-key.test.ts`: `linkUrlKey("https://www.Example.com/a/")` equals `linkUrlKey("http://example.com/a")`; `https://example.com/a?x=1` differs from `https://example.com/a`; `linkUrlKey("not a url")` returns `"not a url"`. `guess-content-type.test.ts`: `https://www.youtube.com/watch?v=abc` and `https://youtu.be/abc` → `YOUTUBE`; `https://example.com/files/Report.PDF?download=1` → `PDF`; `https://example.com/a.mp3` and `.m4a`, `.wav`, `.ogg`, `.flac`, `.aac` → `AUDIO`; `https://example.com/page` and `"nonsense"` → `WEB`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/link-url-key.test.ts src/lib/guess-content-type.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement both.** Move the `key` function out of `isSameLinkUrl` in `src/lib/omnibox.ts` into `linkUrlKey` (same rules: host lowercased without `www.`, pathname without trailing slashes, plus search; raw input when unparseable) and make `isSameLinkUrl` compare two keys. `guessContentType` uses `isYouTubeUrl` from `@/utils/youtube`, then the URL's pathname extension (case-insensitive).
- [ ] **Step 4: Run** the two new test files plus `pnpm vitest run src/lib/omnibox.test.ts` → all PASS.
- [ ] **Step 5: Commit** `git add src/lib && git commit -m "Share the link URL key and add a URL-only content-type guess"`.

### Task 2: Import types, CSV reader, normalization

**Files:**
- Create: `src/lib/import/types.ts`, `src/lib/import/parse-csv.ts`, `src/lib/import/parse-csv.test.ts`, `src/lib/import/normalize.ts`, `src/lib/import/normalize.test.ts`
- Modify: `src/lib/limits.ts` (add `MAX_IMPORT_CHUNK = 200`, `MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024`, `MAX_FOLDER_NAME_LENGTH = 60`), `src/lib/folders.ts` (`validateFolderName` uses `MAX_FOLDER_NAME_LENGTH`; its message is unchanged)

**Interfaces:**
- Produces (`types.ts`): `ImportItem = { url: string; title: string; folder: string | null; createdAt: Date | null }`; `ImportFormat = "bookmarks-html" | "raindrop-csv" | "pocket-csv"`; `ImportLinkInput = { url: string; title: string; folder: string | null; createdAt: string | null }`; `ImportLinksResult = { imported: number; duplicates: number; invalid: number; overLimit: number; foldersCreated: number; unfiledForFolderLimit: number; limitReached: boolean }`.
- Produces: `parseCsv(text: string): string[][]`; `flattenFolderPath(segments: string[]): string | null`; `truncateFolderName(name: string): string`; `cleanImportItems(items: ImportItem[], now?: Date): { items: ImportItem[]; skipped: number }`.

- [ ] **Step 1: Write failing tests.**
  - `parse-csv.test.ts`: a quoted field with a comma; a quoted field containing a line break; a doubled quote (`"a ""b"""` → `a "b"`); a leading BOM is stripped; CRLF and LF both work; a trailing newline adds no empty row; empty fields are kept as `""`.
  - `normalize.test.ts`: `flattenFolderPath(["Dev","Tools"])` → `"Dev / Tools"`; `([" Dev "])` → `"Dev"`; `(["", " "])` → `null`; a path over 60 characters → its last segment; a last segment over 60 → ends with `…`, `.length <= 60`, and contains no lone surrogate (`/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/` does not match) when the cut falls inside an emoji. `cleanImportItems`: drops `javascript:alert(1)`, `chrome://settings`, `file:///x`, `about:blank`, `not a url` (→ `skipped: 5`) and keeps `http`/`https`; sorts newest-first with `null` dates treated as `now` and stable on ties; collapses duplicates by `linkUrlKey` keeping the first after sorting; sets `createdAt` to `null` when before 2000-01-01 or after `now`; trims titles.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/import` → FAIL.
- [ ] **Step 3: Implement** the files above with the signatures above. `parseCsv` is an RFC 4180 reader written as a small state machine (no dependency). `truncateFolderName` cuts by code points so the result, plus `…`, is at most `MAX_FOLDER_NAME_LENGTH` UTF-16 units.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/import src/lib/folders.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add import types, a CSV reader and item normalization"`.

### Task 3: Raindrop and Pocket parsers

**Files:**
- Create: `src/lib/import/parse-raindrop-csv.ts`, `parse-raindrop-csv.test.ts`, `parse-pocket-csv.ts`, `parse-pocket-csv.test.ts`

**Interfaces:**
- Consumes: `parseCsv`, `flattenFolderPath`, `ImportItem`.
- Produces: `parseRaindropCsv(text: string): ImportItem[]`; `parsePocketCsv(text: string): ImportItem[]` (unvalidated: cleaning happens in `cleanImportItems`).

- [ ] **Step 1: Write failing tests** with inline made-up CSV strings.
  - Raindrop, header `id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite` (the real full-backup header): a row with folder `Design Engineer / Artists` → `folder` `"Design Engineer / Artists"`; folder `Unsorted` (any case) or empty → `null`; a quoted title containing a comma; `created` `2026-10-11T17:40:26.872Z` → that `Date`; `created` `"garbage"` or empty → `null`; header lookup is case-insensitive; a header **without** `folder` (single-collection export: `id,title,note,excerpt,url,tags,created,cover,highlights,favorite`) → every `folder` is `null`; a leading BOM; a folder over 60 characters → its last ` / ` segment.
  - Pocket, header `title,url,time_added,tags,status`: `time_added` `1700000000` → `new Date(1700000000000)`; `""`, `0`, `-5`, `abc` → `null`; `folder` always `null`; tags/status ignored.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/import/parse-raindrop-csv.test.ts src/lib/import/parse-pocket-csv.test.ts` → FAIL.
- [ ] **Step 3: Implement** both: find columns by lower-cased header name; skip rows without a `url` cell; use `flattenFolderPath(value.split(" / "))` for Raindrop folders.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `git commit -m "Parse Raindrop and Pocket CSV exports"`.

### Task 4: Browser bookmarks (HTML) parser

**Files:**
- Create: `src/lib/import/parse-bookmarks-html.ts`, `src/lib/import/parse-bookmarks-html.test.ts`

**Interfaces:**
- Consumes: `flattenFolderPath`, `ImportItem`.
- Produces: `parseBookmarksHtml(text: string): ImportItem[]`.

- [ ] **Step 1: Write failing tests** with inline Netscape fixtures.
  - Chrome style: `<!DOCTYPE NETSCAPE-Bookmark-file-1>`, a depth-1 `<H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>` containing a direct link (→ `folder: null`), a folder `Dev` with a link (→ `"Dev"`) and `Dev` > `Tools` with a link (→ `"Dev / Tools"`); `Other bookmarks` dropped by name; a title `B &amp; C` → `B & C` and an `HREF` with `&amp;` → `&`.
  - Firefox style: `<H3 UNFILED_BOOKMARKS_FOLDER="true">Other Bookmarks</H3>` dropped; `<DD>` description lines ignored; an `ICON="data:image/png;base64,…"` attribute does not break parsing; a title with inner `<b>` tags is stripped to text.
  - `ADD_DATE` in seconds (`1700000000`), milliseconds (`1700000000000`) and microseconds (`1700000000000000`) all → `new Date(1700000000000)`; missing, `0` or negative → `null`.
  - Lower-case tags (`<dt><a href=…>`) work; single-quoted attribute values work; `Favorites bar`, `Bookmarks Toolbar`, `Mobile bookmarks` at depth 1 are dropped like `Bookmarks bar`; the same names at depth 2 are kept as real folders.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/import/parse-bookmarks-html.test.ts` → FAIL.
- [ ] **Step 3: Implement** as a single regex-driven pass, no DOM: scan tags `dl|h3|a` (case-insensitive, with their attributes); on `<H3>` remember the folder name (and its flags); on `<DL>` push the remembered name (or empty) onto a stack and on `</DL>` pop; on `<A …>…</A>` emit an item whose folder is `flattenFolderPath(stack after dropping a depth-1 entry that is flagged or named as a browser root)`. Decode `&amp; &lt; &gt; &quot; &#39;` and numeric entities; strip inner tags from titles. `ADD_DATE` units are told apart by magnitude (above 1e14 µs, above 1e11 ms, otherwise seconds).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `git commit -m "Parse browser bookmark exports (Netscape HTML)"`.

### Task 5: Format detection and the `parseImportFile` entry point

**Files:**
- Create: `src/lib/import/detect-format.ts`, `detect-format.test.ts`, `index.ts`, `index.test.ts`

**Interfaces:**
- Consumes: the three parsers, `cleanImportItems`, `ImportFormat`, `ImportItem`.
- Produces: `detectImportFormat(text: string): ImportFormat | null`; `type ParseImportResult = { ok: true; format: ImportFormat; items: ImportItem[]; skipped: number; folders: { name: string; count: number }[] } | { ok: false; reason: "unrecognized" | "empty" }`; `parseImportFile(text: string, now?: Date): ParseImportResult`.

- [ ] **Step 1: Write failing tests.** Detection: first 2 KB containing `netscape-bookmark-file` (any case) or `<dt><a href` → `bookmarks-html`; a header with `url`, `title`, `created` and `folder` (or `excerpt`) → `raindrop-csv`; a header with `title`, `url`, `time_added` → `pocket-csv`; plain prose, JSON and an empty string → `null`. `parseImportFile`: a Raindrop sample → `ok: true` with cleaned, newest-first `items` and `folders` grouped **case-insensitively** (`Dev` and ` dev ` are one entry; the first-seen spelling is the name), sorted by count descending then name; unrecognized text → `{ ok: false, reason: "unrecognized" }`; a header with no data rows, or only non-web URLs, → `{ ok: false, reason: "empty" }`; `skipped` carries the cleaning count.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/import/detect-format.test.ts src/lib/import/index.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files; `parseImportFile` detects, dispatches to the parser, cleans, and builds `folders` from the cleaned items' `folder` values.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/import` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Detect the import format and add the parseImportFile entry point"`.

### Task 6: Extract `createFolderInTx`

**Files:**
- Modify: `src/lib/folders.ts`, `src/lib/folders.test.ts`

**Interfaces:**
- Produces: `createFolderInTx(tx: Prisma.TransactionClient, userId: string, name: string, emoji?: string | null, description?: string | null): Promise<FolderSummary>` — validates name, emoji and description, enforces `MAX_FOLDERS` (`FolderLimitError`), checks the name is free, generates the slug, appends the folder last and returns the summary. **The caller must already hold the folder advisory lock.** `createFolder(userId, name, emoji?, description?)` keeps its exact signature and behavior.

- [ ] **Step 1: Write a failing test** in `folders.test.ts` (follow its existing mock style): `createFolderInTx` creates a folder through the given `tx`, does **not** call `$executeRaw` (takes no lock), and throws `FolderLimitError` when `tx.folder.count` returns `MAX_FOLDERS`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/folders.test.ts` → the new test FAILS, existing ones pass.
- [ ] **Step 3: Refactor.** Move the body of `createFolder`'s transaction callback (count check, `assertNameAvailable`, `generateUniqueSlug`, position, `create`) into `createFolderInTx`; `createFolder` validates input, opens `prisma.$transaction`, takes the lock and calls it, keeping the unique-constraint error mapping.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/folders.test.ts` → all PASS (the existing `createFolder` tests unchanged).
- [ ] **Step 5: Commit** `git commit -m "Extract createFolderInTx so bulk code can create folders inside its own transaction"`.

### Task 7: Schema, migration and the bulk import service

**Files:**
- Modify: `prisma/schema.prisma` (`Link.needsMetadata Boolean @default(false)`, `@@index([needsMetadata, createdAt])`)
- Create: `prisma/migrations/20261011190000_add_link_needs_metadata/migration.sql` (the timestamp must be later than the newest existing migration, currently `20261008120000_folder_position`), `src/lib/import-links.ts`, `src/lib/import-links.test.ts`

**Interfaces:**
- Consumes: `linkUrlKey`, `guessContentType`, `createFolderInTx`, `suggestFolderEmoji` (`string | null`), `getUrlDomain` (`@/utils/formatter`), `getDefaultFaviconUrl` (`@/utils/default-favicon`), `truncateFolderName`, `MAX_SAVED_LINKS`, `MAX_FOLDERS`, `MAX_FOLDER_NAME_LENGTH`, `ImportLinkInput`, `ImportLinksResult`.
- Produces: `importLinksForUser(userId: string, inputs: ImportLinkInput[], now?: Date): Promise<ImportLinksResult>` (`server-only`).

- [ ] **Step 1: Migration and schema.** Write the migration SQL exactly: `ALTER TABLE "links" ADD COLUMN "needsMetadata" BOOLEAN NOT NULL DEFAULT false;` and `CREATE INDEX "links_needsMetadata_createdAt_idx" ON "links"("needsMetadata", "createdAt");`. Add the field and index to the schema. Run `pnpm prisma generate`.
- [ ] **Step 2: Verify the migration against the local e2e database** (not the hosted dev database): `DATABASE_URL=postgresql://purl:purl@127.0.0.1:5432/purl_dev pnpm prisma migrate deploy`, then `DATABASE_URL=… pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → exit 0 (no drift). Docker's `purl-postgres` container must be running.
- [ ] **Step 3: Write failing tests** in `import-links.test.ts`, mocking `@/lib/prisma` like `src/lib/entitlements.test.ts` (client with `$transaction` running the callback against itself, `$executeRaw`, `link.{count,findMany,createMany}`, `folder.findMany`) and mocking `@/lib/folders` (`createFolderInTx` returning `{ id: "folder-N", name }`):
  1. The two locks are taken in order: first `$executeRaw` value is `"user-1"`, second is `"links:user-1"`.
  2. One valid link is written with exactly: `url`, `title`, `domain`, `favicon = getDefaultFaviconUrl(domain)`, `description: null`, `thumbnail: null`, `contentType` from `guessContentType`, `createdAt`, `folderId`, `userId`, `needsMetadata: true`.
  3. Duplicates (`www`, trailing slash, case) against existing URLs and within the chunk → `duplicates`; existing links are untouched.
  4. Capacity: existing count 998 and five valid links → `imported: 2`, `overLimit: 3`, `limitReached: true`.
  5. Invalid → `invalid` (and no throw): `javascript:x`, an empty URL, a 2,049-character URL. A 600-character title is cut to 500; an empty title becomes the domain; `createdAt` of `"not a date"`, `"1999-12-31"` and a future date becomes `now`.
  6. Folders: an existing `Reading list` is matched by `"reading LIST "`; a new `Dev / Tools` calls `createFolderInTx(tx, "user-1", "Dev / Tools", <suggested emoji or null>)`; `Dev` and ` dev ` in one chunk create **one** folder; with 100 existing folders nothing is created, the links are written with `folderId: null` and counted in `unfiledForFolderLimit`; a 70-character name containing an emoji is truncated to at most 60 characters, ends with `…`, and `createFolderInTx` is called without throwing; `foldersCreated` counts creations.
  7. If every link is a duplicate or invalid, `createMany` is **not** called and the result is `imported: 0` (Review Focus 1).
- [ ] **Step 4: Run** `pnpm vitest run src/lib/import-links.test.ts` → FAIL.
- [ ] **Step 5: Implement** `importLinksForUser` per the spec (§2): validate/normalize each input, one `$transaction` taking the two locks, load existing URLs (`link.findMany`, select `url`) and the count, dedupe via `linkUrlKey`, cut at `MAX_SAVED_LINKS − count`, resolve folders (case- and space-insensitive match on trimmed names; create while the folder count is below `MAX_FOLDERS`), one `link.createMany`.
- [ ] **Step 6: Run** `pnpm vitest run src/lib/import-links.test.ts` and `pnpm typecheck` → PASS.
- [ ] **Step 7: Commit** `git commit -m "Add Link.needsMetadata and the bulk import service"`.

### Task 8: The import endpoint and its rate limit

**Files:**
- Create: `src/lib/import-body.ts`, `src/lib/import-body.test.ts`, `src/app/api/links/import/route.ts`, `src/app/api/links/import/route.test.ts`
- Modify: `src/lib/upstash-rate-limit.ts`, `src/lib/upstash-rate-limit.test.ts`, `src/lib/proxy-rate-limit.ts`, `src/lib/proxy-rate-limit.test.ts`

**Interfaces:**
- Consumes: `importLinksForUser`, `ImportLinkInput`, `MAX_IMPORT_CHUNK`, `getSessionUser`, `broadcastLinksChanged`, `LINKS_ORIGIN_HEADER`, `parseLinksOrigin`.
- Produces: `parseImportBody(body: unknown): { ok: true; links: ImportLinkInput[] } | { ok: false; error: string; code: "INVALID_BODY" | "TOO_MANY" }`; `POST /api/links/import` → 200 `ImportLinksResult`; `getLinksImportRateLimiter(): Ratelimit | null`.

- [ ] **Step 1: Write failing tests.**
  - `import-body.test.ts`: a non-object, a missing/non-array/empty `links`, or an item with a non-string `url` → `INVALID_BODY`; 201 links → `TOO_MANY` (Review Focus 2); `folder` and `createdAt` accept `null` or absence; unknown extra fields are ignored.
  - `route.test.ts` (mock the service, session and broadcast; follow `src/app/api/links/route.test.ts`): no session → 401; invalid JSON → 400 `INVALID_BODY`; 201 links → 400 `TOO_MANY`; success → 200 with the service's result and exactly one broadcast (with the parsed origin header); a result with `imported: 0` → 200 and no broadcast.
  - Rate limit: `upstash-rate-limit.test.ts` pins the bucket (`links_import`, 30, `"1 m"`); `proxy-rate-limit.test.ts` shows `POST /api/links/import` is limited by IP and returns 429 with `Retry-After` when the limiter says no, while `GET` is not touched.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/import-body.test.ts src/app/api/links/import src/lib/upstash-rate-limit.test.ts src/lib/proxy-rate-limit.test.ts` → FAIL.
- [ ] **Step 3: Implement** the body parser, the route (read JSON → parse → session → service → broadcast when `imported > 0` → JSON) and the limiter plus its `pathname === "/api/links/import" && request.method === "POST"` branch in `rateLimitApiRequest`, mirroring the `/api/links` POST branch.
- [ ] **Step 4: Run** the same command and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add POST /api/links/import with its rate limit"`.

### Task 9: The enrichment cron

**Files:**
- Create: `src/lib/enrich-links.ts`, `src/lib/enrich-links.test.ts`, `src/app/api/cron/enrich-links/route.ts`, `src/app/api/cron/enrich-links/route.test.ts`
- Modify: `vercel.json` (add `"crons": [{ "path": "/api/cron/enrich-links", "schedule": "* * * * *" }]`), `.env.example` (add `CRON_SECRET=` with a one-line comment)

**Interfaces:**
- Consumes: `resolveLinkFromUrl`, `getUrlDomain`, `broadcastLinksChanged`, `prisma`.
- Produces: `ENRICH_BATCH_SIZE = 20`, `ENRICH_CONCURRENCY = 5`, `ENRICH_LINK_TIMEOUT_MS = 20_000`; `enrichedTitle(current: string, url: string, resolvedTitle: string): string`; `type EnrichResult = { claimed: number; enriched: number; failed: number }`; `enrichFlaggedLinks(): Promise<EnrichResult>`; route `GET` (`runtime = "nodejs"`, `maxDuration = 120`).

- [ ] **Step 1: Write failing tests.**
  - `enrichedTitle`: returns the resolved title when `current` is empty, equals the raw URL or equals `getUrlDomain(url)`; otherwise returns `current`.
  - `enrichFlaggedLinks` (mock `prisma.$queryRaw` for the claim, `prisma.link.updateMany`, `resolveLinkFromUrl`, `broadcastLinksChanged`): nothing claimed → `{ claimed: 0, enriched: 0, failed: 0 }` and no lookups; a claimed link is written by id with `description`, `thumbnail`, `favicon`, `domain`, `contentType` (and the title via `enrichedTitle`) and **no `createdAt` key**; one lookup that rejects or exceeds the timeout counts as `failed` and the others still finish; never more than 5 lookups in flight (track concurrency in the mock); one broadcast per distinct `userId`; the claim query text contains `FOR UPDATE SKIP LOCKED`, `LIMIT` of `ENRICH_BATCH_SIZE` and `ORDER BY "createdAt" DESC`.
  - Route: no `CRON_SECRET` configured → 503; missing or wrong `Authorization` → 401; correct secret → 200 with the `EnrichResult`. A config test reads `vercel.json` and asserts the cron entry (path and `* * * * *`).
- [ ] **Step 2: Run** `pnpm vitest run src/lib/enrich-links.test.ts src/app/api/cron` → FAIL.
- [ ] **Step 3: Implement** the worker (claim with one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING id, "userId", url, title, domain` via `$queryRaw`; a small concurrency pool of `ENRICH_CONCURRENCY`; each lookup raced against a timeout; writes via `link.updateMany({ where: { id } })` so a deleted link is a no-op) and the route (Bearer check with `timingSafeEqual`, like `src/app/api/notion/revalidate/route.ts`).
- [ ] **Step 4: Run** the same command and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the cron job that fills in details for imported links"`.

### Task 10: The import runner and wording

**Files:**
- Create: `src/lib/import/run-import.ts`, `run-import.test.ts`, `import-summary.ts`, `import-summary.test.ts`

**Interfaces:**
- Consumes: `ImportItem`, `ImportFormat`, `ImportLinkInput`, `ImportLinksResult`, `MAX_IMPORT_CHUNK`, `MAX_FOLDERS`, `MAX_SAVED_LINKS`, `linksOriginHeaders` (`@/lib/links-origin`).
- Produces: `type RunImportOutcome = { totals: ImportLinksResult; stopped: "done" | "limit" | "aborted" | "error"; error?: { status?: number; message: string } }`; `runImport(items: ImportItem[], opts?: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }): Promise<RunImportOutcome>`; `importableCount(itemCount: number, room: number): number`; `previewSummary(parsed: { format: ImportFormat; itemCount: number; folders: { name: string; count: number }[]; skipped: number }, room: number, existingFolderNames: string[]): { heading: string; lines: string[] }`; `doneSummary(totals: ImportLinksResult, skipped: number): { title: string; lines: string[] }`.

- [ ] **Step 1: Write failing tests.**
  - `runImport` (stub `fetch`): 450 items → three POSTs of 200, 200 and 50 to `/api/links/import` with `Content-Type: application/json` and `linksOriginHeaders`; `createdAt` is sent as an ISO string or `null`; totals are summed field by field; `onProgress` is called with `(200,450)`, `(400,450)`, `(450,450)`; `limitReached` in a response stops before the next chunk (`stopped: "limit"`); a 429 → `stopped: "error"`, message `Too many requests. Wait a minute and try again.`; a thrown network error → message `Couldn’t reach Purl. Check your connection and try again.`; an aborted signal between chunks → `stopped: "aborted"` with the totals so far.
  - `importableCount`: `min(itemCount, max(room, 0))`.
  - `previewSummary` exact copy: heading `312 links in 14 folders` (`1 link in 1 folder`; with no folders `312 links`); lines, in order and only when they apply — `Browser bookmarks` / `Raindrop CSV` / `Pocket CSV`; `All 312 fit.` or `You have room for 640 more, so the 640 newest are imported.`; `This file has no folder information, so links go to Home.`; `4 items aren’t web links and will be skipped.` (`1 item isn’t a web link and will be skipped.`); `3 folders won’t fit in your 100-folder limit; their links go to Home.` (computed from folder names not already in `existingFolderNames`, compared case-insensitively, beyond the room left under `MAX_FOLDERS`).
  - `doneSummary` exact copy: title `Imported 300 links` (`Imported 1 link`; `Nothing new to import` when `imported` is 0); lines when they apply — `Created 12 folders.` (`Created 1 folder.`), `8 were already saved and were skipped.` (`1 was already saved and was skipped.`; and `All 8 links were already saved.` when `imported` is 0 and every non-invalid link was a duplicate, Review Focus 1), `4 weren’t web links.` (`invalid + skipped`, `1 wasn’t a web link.`), `5 weren’t imported because you reached your 1,000-link limit.`, `2 links went to Home because you reached your 100-folder limit.`, and always last, when `imported > 0`: `Thumbnails and details fill in over the next few minutes.`
- [ ] **Step 2: Run** `pnpm vitest run src/lib/import/run-import.test.ts src/lib/import/import-summary.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files (client-safe: no `server-only` imports).
- [ ] **Step 4: Run** the same command and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the import runner and the preview and done wording"`.

### Task 11: The Import tab, with a smoke e2e

**Files:**
- Create: `src/components/settings-import.tsx`, `e2e/import.spec.ts`, `e2e/fixtures/import/browser-bookmarks.html`, `e2e/fixtures/import/raindrop-backup.csv`, `e2e/fixtures/import/raindrop-collection.csv`, `e2e/fixtures/import/pocket.csv` (made-up rows only; the Raindrop files use the real column headers recorded in the spec; the HTML has a nested `Dev / Tools` folder, a root-level toolbar folder and one `javascript:` link; each file has at least one link with a title containing a comma or an accent)
- Modify: `src/components/settings-content.tsx` (new `Import` tab between Integrations and Account, `<SettingsImport usage={usageSummary} closeDialog={closeDialog} />`), `src/components/dialog-settings.tsx` (`SETTINGS_TAB_VALUES` gets `"import"`; description becomes `Usage, integrations, import, and account`)

**Interfaces:**
- Consumes: `parseImportFile`, `MAX_IMPORT_FILE_BYTES`, `runImport`, `importableCount`, `previewSummary`, `doneSummary`, `useFolders()` (`folders`, `refresh`), `UsageMeterData`, `Typography`, existing `Button` and `Collapsible`, `useRouter`.
- Produces: `SettingsImport({ usage, closeDialog }: { usage: UsageMeterData | null; closeDialog: () => void })`; `data-cy` hooks: `import-file-input`, `import-preview`, `import-submit`, `import-progress`, `import-summary`, `import-error`, `import-choose-another`, `import-view-links`.

- [ ] **Step 1: Write the smoke e2e** (`e2e/import.spec.ts`, signed-in fixture; open `/home?settings=import`, which the existing deep link supports; use `setInputFiles` on `import-file-input`): the browser HTML shows a preview whose text contains `links in` and `Browser bookmarks`; clicking `import-submit` shows `import-summary` containing `Imported`; `/home` then lists the links and the folder menu contains `Dev / Tools`; the Raindrop backup shows `Raindrop CSV`, and a nested `Design Engineer / Artists` folder appears after importing.
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/import.spec.ts` → FAIL (no tab yet). Docker's `purl-postgres` must be running (see `CLAUDE.md`).
- [ ] **Step 3: Implement `SettingsImport`** as one component with states `idle | preview | importing | done | error` (the file read and parse happen in the browser; a file over `MAX_IMPORT_FILE_BYTES` is refused before reading):
  - idle: a real visually-hidden `<input type="file" accept=".html,.htm,.csv">` behind a visible Button, a drop area, the three how-to lines and the privacy sentence from the spec; drag-over shows the text `Drop to import`.
  - preview: `previewSummary` copy, a closed Collapsible "See folders" (name and count), buttons **Import** and **Choose another file**; Import slices the items with `importableCount(items.length, usage ? usage.saves.cap - usage.saves.used : MAX_SAVED_LINKS)`; the click handler returns immediately unless the state is `preview` (Review Focus 4).
  - importing: `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and tabular text `Importing 120 of 312`; width transition disabled under reduced motion; an `AbortController` aborted on unmount.
  - done: `doneSummary` copy; **View links** calls `closeDialog()` then `router.push("/home")`; **Import another file** returns to idle; call `useFolders().refresh()` when the import finishes.
  - error: `role="alert"` with the messages in the spec (`We couldn’t recognize this file. Use a bookmarks export from your browser, or a CSV from Raindrop or Pocket.`, `This file is over 5 MB. Export fewer bookmarks and try again.`, `No links found in this file.`, the runner's own error text with a **Try again** that resumes safely because duplicates are skipped).
  - Focus moves to the preview heading after a file is read and to the summary heading when done; one polite status line at the start and at the end of an import; buttons full width under `sm`. Use `Typography` for text and named Reicon imports.
- [ ] **Step 4: Run** the smoke e2e in both browsers, `pnpm typecheck` and `pnpm lint` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the Import tab to Settings"`.

### Task 12: Remaining e2e, docs and final verification

**Files:**
- Modify: `e2e/import.spec.ts`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-11-bookmarks-import-design.md` (three amendments: add `src/components/settings-content.tsx` to the "Changed" list; the done title is `Imported 300 links` followed by `Created 12 folders.`, because the server returns `foldersCreated`, not the number of folders used; the preview line is `You have room for 640 more, so the 640 newest are imported.`, the spec's example had mismatched numbers)

- [ ] **Step 1: Add e2e tests.** Importing the same file twice → the second summary reads `Nothing new to import` and `All N links were already saved.` (Review Focus 1); clicking `import-submit` twice quickly leaves exactly the file's link count (Review Focus 4); an unsupported file (e.g. a `.csv` with unknown headers, and a `.html` without bookmarks) shows `import-error` with the recognized-formats message; the single-collection Raindrop export previews `This file has no folder information, so links go to Home.`; imported links appear under their original dates, not "Today". The cron test, skipped when `process.env.CRON_SECRET` is unset: after an import, `fetch` of `/api/cron/enrich-links` with `Authorization: Bearer <secret>` returns 200, the imported links' `needsMetadata` is false (query through `e2e/support/db.ts`), their imported titles are kept and their `createdAt` is unchanged. Add `CRON_SECRET=e2e-cron-secret` to the git-ignored `.env.e2e` and to the template in `.env.example`.
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/import.spec.ts` → PASS in Chromium and WebKit.
- [ ] **Step 3: Document.** Add a `CLAUDE.md` section "Importing links" covering: the formats and the real Raindrop findings, the client parse → chunked POST flow, the endpoint's rules and response, `needsMetadata` and the cron (schedule, `CRON_SECRET`, batch/concurrency, at-most-once, production-only, the manual `curl` for dev), the Import tab, and the e2e setup. Apply the three spec amendments above.
- [ ] **Step 4: Final verification:** `pnpm typecheck`, `pnpm lint` (no new warnings), `pnpm test`, and `pnpm exec playwright test` (full suite) → all PASS.
- [ ] **Step 5: Commit** `git commit -m "Test and document the bookmarks import"`. Do not open a PR until asked; the PR description must note the manual setup (`CRON_SECRET` in Vercel Production) and that the HTML and Pocket formats are unverified against real files.
