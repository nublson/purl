# Reader View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a searchable, Markdown reader view of every saved web page, made by a background cron, opened from the row or card at `/read/[id]`, with its state in the link menu.

**Architecture:** A `reader_views` table (one row per qualifying link; no row = queued) filled by a per-minute cron that fetches through `safeFetch`, extracts with Readability on linkedom and converts to Markdown with Turndown. Owner reads carry a small `readerView` state; the read page renders the Markdown with react-markdown; search adds a Postgres full-text id list to the existing substring clause.

**Tech Stack:** Next.js 16 App Router, Prisma 7 / Postgres, Vitest, Playwright, `@mozilla/readability`, `linkedom`, `turndown` (installed), `react-markdown`, `remark-gfm`, MCP SDK (`server.tool`).

**Spec:** `docs/superpowers/specs/2026-11-01-reader-view-design.md`

## Global Constraints

- Names: `ReaderView` model, `reader_views` table, `ReaderViewStatus` enum (`PENDING`, `READY`, `NONE`, `FAILED`), `link.readerView`, `src/lib/reader-views.ts`, `GET /api/cron/reader-views`, `/read/[id]`.
- Reasons (exact strings): `not_html`, `no_article`, `unreachable`, `timeout`, `too_large`; MCP adds `not_a_page`.
- A link qualifies when `contentType = 'WEB'` and `fileKey IS NULL`.
- Constants in `src/lib/limits.ts`: `READER_BATCH_SIZE = 20`, `READER_CONCURRENCY = 5`, `READER_FETCH_TIMEOUT_MS = 20_000`, `READER_ABORT_GRACE_MS = 2_000`, `READER_HTML_MAX_BYTES = 5 * 1024 * 1024`, `READER_MARKDOWN_MAX_BYTES = 300 * 1024`, `READER_PENDING_RETRY_MS = 10 * 60 * 1000`.
- Every outbound request goes through `safeFetch`. No new environment variables.
- Never public: the shared folder page, its load-more API, the Atom feed, the folder preview image, the landing demo and the export carry no reader view.
- `react-markdown`, `remark-gfm`, `linkedom` and `@mozilla/readability` are never imported by Home's static bundle (the extractor runs in the cron; the renderer only on `/read/[id]`).
- Render text elements through `Typography` (project rule); icons are `reicon-react` named imports.
- Migrations are additive. purl-dev gets the migration by hand from the user (`env DOTENV_CONFIG_PATH=.env.local pnpm prisma migrate deploy`); the agent never runs it against purl-dev. e2e runs against the local Docker database via `.env.e2e`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit to `develop`; work stays on `feat/reader-view`.

## Review Focus

1. **A URL edit while the row is `PENDING`**: the run that claimed the old URL must not write the old page's Markdown over the reset. The final update is conditional on the row still existing with the same `claimedAt` (Task 3 test "drops the result when the row was reset meanwhile").
2. **A search with Postgres tsquery syntax** (`a & b`, `foo:`, `'`, `!`, `(`, `\`): never a 500; it either matches or returns no ids (Task 4 test "builds no query from punctuation only" and "quotes operators").
3. **Relative links and `data:`/`javascript:` URLs in the article**: links and images resolved to absolute http(s); anything else dropped, so the read page never renders a `javascript:` href (Task 2 test "drops non-http links and images").
4. **The shared folder page lists through `listLinksForUser`**: the new `readerView` must not leak through `PublicLink` (Task 1 test "public folder links carry no readerView").
5. **A page that claims HTML but is huge or never ends**: the stream guard stops at 5 MB and the abort at 20 s, each ending in `FAILED` with its reason, never a stuck `PENDING` past one retry (Task 3 tests "too_large from the stream" and "timeout").

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261101120000_reader_views/migration.sql` | Model, enum, generated `tsv`, indexes |
| `src/lib/limits.ts` | The seven constants |
| `src/utils/links.ts` | `ReaderViewState` type, `Link.readerView` |
| `src/lib/links.ts` | `READER_VIEW_STATE_INCLUDE`, `LinkRow`/`mapRowToLink`, owner reads, `linkQueryWhere(q, readerLinkIds?)`, URL-change reset |
| `src/lib/serialize-link.ts` | `readerView` in the JSON |
| `src/lib/task-pool.ts` | `runPool`, `settledOrAfter` moved out of `enrich-links.ts` |
| `src/lib/reader-markdown.ts` | `extractArticle(html, baseUrl)`, `extractReaderMarkdown(html, baseUrl)`, `cutMarkdown` |
| `src/lib/reader-views.ts` | Claim, run, `buildPendingReaderViews`, `buildReaderTsQuery`, `readerLinkIdsMatching`, `readReaderViewForUser`, `resetFailedReaderView` |
| `src/lib/reader-view.ts` | Client-safe: `linkOpensReader`, `qualifiesForReader`, `readerStateMessage` |
| `src/app/api/cron/reader-views/route.ts` | Cron guard + run |
| `src/app/api/links/[id]/reader-view/retry/route.ts` | Retry |
| `src/lib/mcp.ts` | `read_link` |
| `src/components/link-item.tsx`, `src/components/link-card.tsx` | Opener → `/read/[id]` |
| `src/components/reader-view-menu-state.tsx`, `src/components/link-menu.tsx` | Menu state |
| `src/app/(private)/read/[id]/page.tsx`, `src/app/(private)/read/layout.tsx`, `src/components/reader-content.tsx` | Read page |
| `e2e/support/db.ts`, `e2e/fixtures.ts`, `e2e/reader-view.spec.ts` | e2e |
| `CLAUDE.md`, `public/llms.txt`, `vercel.json` | Docs, cron |

---

### Task 1: Data model and the state on owner reads

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/limits.ts`, `src/utils/links.ts`, `src/lib/links.ts`, `src/lib/serialize-link.ts`
- Create: `prisma/migrations/20261101120000_reader_views/migration.sql`
- Test: `src/lib/links.test.ts`, `src/lib/serialize-link.test.ts`, `src/lib/public-folders.test.ts` (add to existing files; create if absent)

**Interfaces:**
- Produces:
  - `type ReaderViewStatus = "PENDING" | "READY" | "NONE" | "FAILED"` and `type ReaderViewState = { status: ReaderViewStatus; reason: string | null; fetchedAt: string | null }` exported from `src/utils/links.ts`; `Link.readerView: ReaderViewState | null`.
  - `READER_VIEW_STATE_INCLUDE = { readerView: { select: { status: true, reason: true, fetchedAt: true } } } as const` exported from `src/lib/links.ts`, passed as `include` by `listLinksForUser`, `searchLinksForUser`, `readLinkForUser`, and the update's returned row in `updateLinkForUser`.
  - `serializeLink(...)` output gains `readerView: ReaderViewState | null` (`fetchedAt` ISO string).
  - The seven constants in `limits.ts`.

- [ ] **Step 1: Schema.** Add enum `ReaderViewStatus { PENDING READY NONE FAILED }` and model `ReaderView` (`@@map("reader_views")`): `linkId String @id`, `link Link @relation(fields: [linkId], references: [id], onDelete: Cascade)`, `userId String`, `user User @relation(..., onDelete: Cascade)`, `status ReaderViewStatus`, `reason String?`, `markdown String?`, `truncated Boolean @default(false)`, `bytes Int?`, `claimedAt DateTime`, `fetchedAt DateTime?`, `tsv Unsupported("tsvector")?`, `@@index([userId, status])`. Back-relations `Link.readerView ReaderView?`, `User.readerViews ReaderView[]`. Column names follow the existing camelCase-quoted style of `links`.
- [ ] **Step 2: Migration.** Generate with `pnpm prisma migrate dev --create-only --name reader_views` against the e2e database (`env DOTENV_CONFIG_PATH=.env.e2e`), rename the folder to `20261101120000_reader_views`, then replace the `tsv` column line with `"tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("markdown", ''))) STORED` and append `CREATE INDEX "reader_views_tsv_idx" ON "reader_views" USING GIN ("tsv");`. Apply to the e2e DB with `migrate deploy`. Check drift: `pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` (an `Unsupported` generated column may report a diff on `tsv` only; that is expected, note it in the commit message).
- [ ] **Step 3: Write the failing tests.**
  - `links.test.ts` → `mapRowToLink carries the reader view state`: a row with `readerView: { status: "READY", reason: null, fetchedAt: new Date("2026-10-31T10:00:00Z") }` maps to `readerView: { status: "READY", reason: null, fetchedAt: "2026-10-31T10:00:00.000Z" }`; a row with `readerView: null` or without the key maps to `readerView: null`.
  - `links.test.ts` → `listLinksForUser and readLinkForUser include the reader view state`: assert the mocked `prisma.link.findMany` / `findFirst` were called with `include: READER_VIEW_STATE_INCLUDE`.
  - `links.test.ts` → `a URL change deletes the reader view`: `updateLinkForUser` with a new URL calls `prisma.readerView.deleteMany({ where: { linkId } })` in the same `$transaction` as the update; a title-only edit does not call it.
  - `serialize-link.test.ts` → `serializes readerView`: given a mapped link with the READY state, output `readerView` equals it; given none, `null`.
  - `public-folders.test.ts` → `public folder links carry no readerView`: `listPublicFolderLinks` over a mocked row that has `readerView` returns links with no `readerView` key; `"readerView" in PUBLIC_LINK_SELECT` is false.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/links.test.ts src/lib/serialize-link.test.ts src/lib/public-folders.test.ts` — expect the new tests to FAIL.
- [ ] **Step 5: Implement.** Constants; types; `LinkRow.readerView?: { status; reason; fetchedAt: Date | null } | null`; `mapRowToLink` maps it; the four reads pass the include; `updateLinkForUser` wraps the update and the `readerView.deleteMany` in `prisma.$transaction` only when `urlChanged`; `serializeLink`'s `LinkLike.readerView?: ReaderViewState | { status; reason; fetchedAt: Date | null } | null` normalizes to ISO. `listPublicFolderLinks` already copies fields explicitly: leave it, the test pins it.
- [ ] **Step 6: Run** the three files again plus `pnpm typecheck` — PASS.
- [ ] **Step 7: Commit** `feat: reader_views table and the reader view state on owner reads`.

### Task 2: Article extraction to Markdown

**Files:**
- Create: `src/lib/reader-markdown.ts`, `src/lib/reader-markdown.test.ts`, `src/lib/reader-fixtures/article.html`, `src/lib/reader-fixtures/no-article.html`, `src/lib/reader-fixtures/long-article.html` (or generate the long one in the test)
- Modify: `package.json` (`pnpm add @mozilla/readability linkedom`)

**Interfaces:**
- Consumes: `READER_MARKDOWN_MAX_BYTES`.
- Produces (all in `src/lib/reader-markdown.ts`, `import "server-only"`):
  - `extractArticle(html: string, baseUrl: string): { title: string | null; content: string } | null` — linkedom `parseHTML`, a `<base href>` set to `baseUrl`, `isProbablyReaderable(document)` false → `null`, else `new Readability(document).parse()`; `null` when no article or empty `content`.
  - `extractReaderMarkdown(html: string, baseUrl: string): string` — the article's content HTML to Markdown.
  - `cutMarkdown(markdown: string, maxBytes: number): { markdown: string; truncated: boolean; bytes: number }` — UTF-8 bytes; when over, cut at the last `\n` before `maxBytes`.

- [ ] **Step 1: Install** `@mozilla/readability` and `linkedom`.
- [ ] **Step 2: Write the failing tests** (`reader-markdown.test.ts`, base `https://example.com/blog/post`):
  - `converts an article`: `extractArticle(article.html)` non-null; its Markdown contains `## ` heading text, a `- ` bullet, a fenced ```` ``` ```` block, `![A swallow in flight](https://example.com/img/swallow.jpg)` (fixture has `src="/img/swallow.jpg"`), and `[the next post](https://example.com/blog/next)` (fixture has `href="next"`).
  - `removes scripts, iframes, forms, nav, buttons and svg`: none of the fixture's marker strings inside those elements appear.
  - `drops non-http links and images`: a `data:image/png;base64,...` image and a `javascript:alert(1)` link in the fixture leave no `data:` and no `javascript:` in the output (the link's text stays as plain text).
  - `returns null for a page without an article`: `extractArticle(no-article.html)` is `null` (a short nav + form page).
  - `cuts on a line boundary`: `cutMarkdown("a\n".repeat(200_000), 300 * 1024)` → `truncated: true`, `markdown` ends without a partial line, `Buffer.byteLength(markdown) <= 300 * 1024`; a short string → `truncated: false`, `bytes` equals its byte length.
- [ ] **Step 3: Run** `pnpm vitest run src/lib/reader-markdown.test.ts` — FAIL.
- [ ] **Step 4: Implement.** One module-level Turndown instance: `headingStyle: "atx"`, `codeBlockStyle: "fenced"`, `bulletListMarker: "-"`; `.remove(["script","style","iframe","form","nav","button","svg"])`; a rule for `a` that resolves `href` with `new URL(href, baseUrl)` and keeps it only for `http:`/`https:` (else emits the text); a rule for `img` that resolves `src` the same way, drops anything else, keeps `alt`. Because Turndown rules need the base per call, resolve URLs on the linkedom DOM before converting (walk `a[href]`, `img[src]`, rewrite or remove) and keep the Turndown instance static.
- [ ] **Step 5: Run** — PASS.
- [ ] **Step 6: Commit** `feat: extract a page's article as Markdown`.

### Task 3: The pipeline and its cron

**Files:**
- Create: `src/lib/task-pool.ts`, `src/lib/reader-views.ts`, `src/lib/reader-views.test.ts`, `src/app/api/cron/reader-views/route.ts`, `src/app/api/cron/reader-views/route.test.ts`
- Modify: `src/lib/enrich-links.ts` (import `runPool`, `settledOrAfter` from `task-pool.ts`; behavior unchanged), `vercel.json`

**Interfaces:**
- Consumes: `extractArticle`, `extractReaderMarkdown`, `cutMarkdown` (Task 2); constants (Task 1); `safeFetch`, `limitReadableStreamByBytes`, `UnsafeOutboundUrlError` from `src/lib/safe-outbound-fetch.ts`; `broadcastLinksChanged(userId)`.
- Produces:
  - `src/lib/task-pool.ts`: `runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void>`, `settledOrAfter(promise: Promise<unknown>, ms: number): Promise<void>`.
  - `src/lib/reader-views.ts`: `type ReaderRunResult = { claimed: number; ready: number; none: number; failed: number }`; `buildPendingReaderViews(): Promise<ReaderRunResult>`; `type ReaderOutcome = { status: "READY"; markdown: string; truncated: boolean; bytes: number } | { status: "NONE" | "FAILED"; reason: string }`; `makeReaderView(url: string, signal: AbortSignal): Promise<ReaderOutcome>` (exported for tests).

- [ ] **Step 1: Move** `runPool` and `settledOrAfter` to `task-pool.ts`; `pnpm vitest run src/lib/enrich-links.test.ts` stays green.
- [ ] **Step 2: Write the failing tests** (`reader-views.test.ts`, mocking `@/lib/prisma`, `@/lib/safe-outbound-fetch`'s `safeFetch`, `@/lib/realtime-broadcast`; keep the real `limitReadableStreamByBytes`):
  - `makeReaderView`: `READY` for an HTML 200 with the article fixture (markdown non-empty); `FAILED/unreachable` for a 500 and for a thrown network error; `NONE/not_html` for `content-type: application/pdf`; `NONE/no_article` for the no-article fixture; `FAILED/too_large` when `safeFetch` throws `UnsafeOutboundUrlError("Response exceeds maximum size")` and when the body stream exceeds `READER_HTML_MAX_BYTES` ("too_large from the stream"); the request sends `Accept: text/html,application/xhtml+xml`, `maxResponseBytes: READER_HTML_MAX_BYTES` and the signal; the base URL is `res.url` when set (after redirects), else the link URL.
  - `buildPendingReaderViews`: two `$queryRaw` claims (new rows; stale `PENDING` rows) combined, capped at `READER_BATCH_SIZE`; each result written with `prisma.readerView.updateMany({ where: { linkId, claimedAt }, data: { status, reason, markdown, truncated, bytes, fetchedAt } })`; returns the counts; `broadcastLinksChanged` once per distinct `userId` with an updated row.
  - `timeout`: with fake timers, a fetch that never settles is aborted after `READER_FETCH_TIMEOUT_MS` and written `FAILED/timeout`.
  - `drops the result when the row was reset meanwhile`: `updateMany` returns `{ count: 0 }` → not counted, no broadcast for that user.
  - `logs and ends the run when a claim fails`: the claim rejecting → `console.error("[reader] run failed", …)` and `{ claimed: 0, ready: 0, none: 0, failed: 0 }`.
  - Route test (copy the shape of `src/app/api/cron/enrich-links/route.test.ts`): 503 without `CRON_SECRET`, 401 with a wrong bearer, 200 with the run's JSON.
- [ ] **Step 3: Run** `pnpm vitest run src/lib/reader-views.test.ts src/app/api/cron/reader-views/route.test.ts` — FAIL.
- [ ] **Step 4: Implement.** Claim SQL (first statement; the second retries stale rows with `UPDATE "reader_views" SET "claimedAt" = now() WHERE "linkId" IN (SELECT "linkId" FROM "reader_views" WHERE "status" = 'PENDING' AND "claimedAt" < now() - make_interval(secs => $1) ORDER BY "claimedAt" LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING "linkId", "userId", "claimedAt"`, joined to `links` for the URL; run it only for the batch room left):

```sql
INSERT INTO "reader_views" ("linkId", "userId", "status", "claimedAt")
SELECT l."id", l."userId", 'PENDING', now() FROM "links" l
WHERE l."contentType" = 'WEB' AND l."fileKey" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "reader_views" r WHERE r."linkId" = l."id")
ORDER BY l."createdAt" DESC LIMIT $1
FOR UPDATE OF l SKIP LOCKED
ON CONFLICT ("linkId") DO NOTHING
RETURNING "linkId", "userId", "claimedAt";
```

  Per link: an `AbortController` aborted after `READER_FETCH_TIMEOUT_MS`; on timeout, `settledOrAfter(work, READER_ABORT_GRACE_MS)` then `FAILED/timeout` (same shape as `lookUp` in `enrich-links.ts`). Read the body as text through `limitReadableStreamByBytes(res.body, READER_HTML_MAX_BYTES)`. A non-HTML type is anything whose `content-type` doesn't contain `text/html` or `application/xhtml+xml`. Route: `runtime = "nodejs"`, `maxDuration = 120`, same guard as enrich (move nothing; duplicate the small `safeEqual` guard as the sweep route does, or import if a shared helper exists). Add `{ "path": "/api/cron/reader-views", "schedule": "* * * * *" }` to `vercel.json`.
- [ ] **Step 5: Run** both test files and `src/lib/enrich-links.test.ts` — PASS.
- [ ] **Step 6: Commit** `feat: a cron that makes reader views`.

### Task 4: Search inside reader views

**Files:**
- Modify: `src/lib/reader-views.ts`, `src/lib/links.ts`
- Test: `src/lib/reader-views.test.ts`, `src/lib/links.test.ts`

**Interfaces:**
- Produces:
  - `buildReaderTsQuery(q: string): string | null` and `readerLinkIdsMatching(userId: string, q: string): Promise<string[]>` in `reader-views.ts`.
  - `linkQueryWhere(query: string | undefined, readerLinkIds?: string[])` in `links.ts`: same return shape, the `OR` gains `{ id: { in: readerLinkIds } }` when non-empty.

- [ ] **Step 1: Write the failing tests.**
  - `buildReaderTsQuery`: `"Swal"` → `"'swal':*"`; `"swallow  migration"` → `"'swallow':* & 'migration':*"`; `"it's"` → `"'it''s':*"`; "quotes operators": `"a & b:c \\x"` → `"'a':* & '&':* & 'bc':* & 'x':*"`; "builds no query from punctuation only": `"\\ :"` → `null`; `"   "` → `null`. The query is cut at `MAX_LINK_SEARCH_QUERY_LENGTH` first.
  - `readerLinkIdsMatching`: returns `[]` without querying when `buildReaderTsQuery` is null; otherwise one `$queryRaw` whose SQL contains `status = 'READY'`, `to_tsquery('simple'`, `LIMIT 1000`, and maps rows to ids.
  - `linkQueryWhere("x", ["a","b"])` → the five substring clauses plus `{ id: { in: ["a","b"] } }`; with `[]` or omitted → the five only.
  - `listLinksForUser` and `searchLinksForUser` with a query call `readerLinkIdsMatching(userId, query)` and pass its ids; without a query they don't call it.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Words split on whitespace; per word: lowercase, drop `\` and `:`, skip if empty, double `'`, wrap in quotes, append `:*`; join with ` & `. A `to_tsquery` input made only of quoted lexemes can't be a syntax error. Import `readerLinkIdsMatching` into `links.ts` (watch for a cycle: `reader-views.ts` must not import `links.ts`).
- [ ] **Step 4: Run** — PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: search matches inside reader views`.

### Task 5: Retry route

**Files:**
- Create: `src/app/api/links/[id]/reader-view/retry/route.ts`, `src/app/api/links/[id]/reader-view/retry/route.test.ts`
- Modify: `src/lib/reader-views.ts`

**Interfaces:**
- Produces: `resetFailedReaderView(userId: string, linkId: string): Promise<"reset" | "not_found" | "not_failed">` in `reader-views.ts` (`not_found` when the link isn't the user's; `not_failed` when there's no row or it isn't `FAILED`; `reset` deletes the row with `deleteMany({ where: { linkId, userId, status: "FAILED" } })`).

- [ ] **Step 1: Write the failing tests** (mock `auth.api.getSession` the way `src/app/api/links/[id]/route.test.ts` does, `getLinkPreviewRateLimiter`, and `resetFailedReaderView`): 401 without a session; 429 when the limiter refuses (`tooManyRequests`); 404 `{ error: "Not found" }` for `not_found`; 409 `{ error: "The reader view isn't failed.", code: "NOT_FAILED" }` for `not_failed`; 200 `{ ok: true }` for `reset`, then `broadcastLinksChanged(userId)` called. Plus unit tests for `resetFailedReaderView`'s three answers.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `POST` (session lookup as in the `[id]` route, limiter keyed by user id, then `resetFailedReaderView`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: retry a failed reader view`.

### Task 6: MCP `read_link`

**Files:**
- Modify: `src/lib/mcp.ts`, `src/lib/reader-views.ts`
- Test: `src/lib/mcp.test.ts`

**Interfaces:**
- Produces: `readReaderViewForUser(userId: string, linkId: string): Promise<{ link: { title: string; url: string; contentType: ContentType; fileKey: string | null }; view: { status: ReaderViewStatus; reason: string | null; markdown: string | null; fetchedAt: Date | null } | null } | null>` in `reader-views.ts` (null when not the user's); `readLinkTool(userId: string, id: string): Promise<ToolResult>` in `mcp.ts`.

- [ ] **Step 1: Write the failing tests:** ready → JSON `{ status: "READY", reason: null, title, url, markdown }`; no row → `{ status: "PENDING", reason: null, …, markdown: null }`; an upload or a PDF → `{ status: "NONE", reason: "not_a_page", markdown: null }`; not the user's → error content `"Not found."`; `list_saved_items` output includes `readerView`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/mcp.test.ts` — FAIL.
- [ ] **Step 3: Implement** and register beside `get_link`: `server.tool("read_link", "Read a saved web page's reader view: its article as Markdown, kept by Purl even if the page changes or disappears. markdown is null until the reader view is ready.", { id: z.string().describe("The link id") }, { readOnlyHint: true }, …)`. A missing row answers `PENDING` (no row means queued).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: MCP read_link`.

### Task 7: Opening the reader view from rows and cards

**Files:**
- Create: `src/lib/reader-view.ts`, `src/lib/reader-view.test.ts`
- Modify: `src/components/link-item.tsx` (the `<a target="_blank">` opener near line 401), `src/components/link-card.tsx` (the `<a>` opener near line 250)

**Interfaces:**
- Consumes: `Link.readerView` (Task 1), `linkKind` from `src/lib/link-kind.ts`.
- Produces (client-safe, no server imports): `qualifiesForReader(link: Pick<Link, "contentType" | "upload">): boolean`; `linkOpensReader(link: Link): boolean`; `readerViewPath(id: string): string` → `/read/${id}`.

- [ ] **Step 1: Write the failing tests:** `linkOpensReader` true for a WEB, non-upload, non-embed link with `READY`; false with `embed: true`, for an upload, for PDF/YOUTUBE/IMAGE/VIDEO/AUDIO, for `PENDING`/`NONE`/`FAILED`/`null`. `qualifiesForReader` true only for WEB and not upload.
- [ ] **Step 2: Run** — FAIL; implement; PASS.
- [ ] **Step 3: Wire the openers.** In both components, when `linkOpensReader(link) && !demo`, render `next/link`'s `Link` (imported as `NextLink`, as `link-menu.tsx` does) with `href={readerViewPath(link.id)}`, `prefetch={false}`, no `target`, `aria-label={link.title}`, keeping every other prop and the same `onClick` guards (long-press consumed → `preventDefault`; selecting → `preventDefault` + toggle). Otherwise the current `<a>` unchanged. Media, audio and embed branches come first and stay as they are.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm lint` — clean (no new errors).
- [ ] **Step 5: Commit** `feat: rows and cards open a ready reader view`.

### Task 8: The state in the link menu

**Files:**
- Create: `src/components/reader-view-menu-state.tsx`
- Modify: `src/lib/reader-view.ts`, `src/lib/reader-view.test.ts`, `src/components/link-menu.tsx`

**Interfaces:**
- Consumes: `qualifiesForReader`, `useLinksSyncActions().notifyLinksChanged` (`@/hooks/use-links-sync`), `toast` from `sonner`.
- Produces: `readerStateMessage(state: ReaderViewState | null, opts?: { short?: boolean }): string` in `reader-view.ts`; `ReaderViewMenuState({ link }: { link: Link })`.

- [ ] **Step 1: Write the failing tests** for `readerStateMessage` with the spec's exact copy:
  - `READY` + `fetchedAt "2026-10-31T10:00:00.000Z"`, `short: true` → `"Reader view ready · from Oct 31"` (UTC month/day).
  - `null` and `PENDING` → `"Making the reader view…"` (menu) and, with `short: false`, `"Purl is making the reader view. It takes a minute or two."` (page).
  - `NONE/no_article` → `"No article to read on this page."`; `NONE/not_html` → `"This page isn't a web page."`.
  - `FAILED/unreachable` → `"Couldn't make a reader view: the page didn't answer."`; `timeout` → `"Couldn't make a reader view: it took too long."`; `too_large` → `"Couldn't make a reader view: the page is too large."`; an unknown reason → the `unreachable` line.
- [ ] **Step 2: Run** — FAIL; implement; PASS.
- [ ] **Step 3: Build `ReaderViewMenuState`.** A `DropdownMenuLabel` styled like `HeaderAddMenu`'s hint (`text-xs font-normal text-muted-foreground px-2 py-1.5`), `data-cy="reader-view-state"`, text from `readerStateMessage(state, { short: true })`. For `FAILED`, a `DropdownMenuItem` "Try again" (`data-cy="reader-view-retry"`): `onSelect` prevents the menu closing, sets busy (`aria-busy`, disabled), POSTs `/api/links/${id}/reader-view/retry`; on 200 shows "Making the reader view…" locally and calls `notifyLinksChanged()`; otherwise `toast.error("Couldn't retry. Try again in a minute.")` and clears busy.
- [ ] **Step 4: Wire it** at the end of `LinkMenu`'s content: `{qualifiesForReader(link) && !isDemo ? (<><DropdownMenuSeparator /><ReaderViewMenuState link={link} /></>) : null}`.
- [ ] **Step 5: Run** `pnpm typecheck && pnpm lint && pnpm vitest run src/lib/reader-view.test.ts` — clean.
- [ ] **Step 6: Commit** `feat: the reader view's state in the link menu`.

### Task 9: The read page

**Files:**
- Create: `src/app/(private)/read/layout.tsx`, `src/app/(private)/read/[id]/page.tsx`, `src/components/reader-content.tsx`
- Modify: `package.json` (`pnpm add react-markdown remark-gfm`), `src/components/static-page.tsx` (export its column class as `STATIC_PAGE_COLUMN`, used by both)

**Interfaces:**
- Consumes: `readReaderViewForUser` (Task 6), `readerStateMessage`, `qualifiesForReader` (Tasks 7–8), `getSessionUser`, `formatUpdatedDate`, `BrandMark`, `safeRemoteImgSrc`, `Typography`.
- Produces: `ReaderContent({ markdown, truncated }: { markdown: string; truncated: boolean })`.

- [ ] **Step 1: Install** `react-markdown` and `remark-gfm`.
- [ ] **Step 2: Layout** `read/layout.tsx`: `<main>` with the static pages' outer frame (copy the wrapper and the `BrandMark` link to `/` from `StaticPage`, accessible name "Purl, home"), children in `STATIC_PAGE_COLUMN`. No providers.
- [ ] **Step 3: Page.** `export const dynamic = "force-dynamic"`; `generateMetadata` → `{ title: link.title, robots: { index: false, follow: false } }`. Signed out → `redirect("/")`; `readReaderViewForUser` null → `notFound()`. Top line (muted, `Typography` small): favicon `<img>` via `safeRemoteImgSrc`, domain, an "Open original" `<a target="_blank" rel="noopener noreferrer" href={link.url}>`, and when `READY` "Reader view from " + `formatUpdatedDate(fetchedAt)`. Then the title as the only `h1`. Body: `READY` → `<ReaderContent>`; not qualifying → "This pearl has no reader view."; otherwise one muted paragraph `readerStateMessage(view, { short: false })` (`READY` never reaches it; for `null` view use `PENDING`'s line).
- [ ] **Step 4: `ReaderContent`** (server component is fine; react-markdown renders on the server): `remarkPlugins={[remarkGfm]}`, no `rehype-raw`, `components` mapping `h1`–`h6` (Markdown `h1` rendered as `h2`, so the title stays the only `h1`), `p`, `ul`/`ol`/`li`, `blockquote`, `code`/`pre` (the static pages' code frame classes `bg-muted border rounded-lg`, no highlighting), `table` (wrapped for horizontal scroll), `a` (`target="_blank" rel="noopener noreferrer"`), `img` (`loading="lazy"`, `src` through `safeRemoteImgSrc`, dropped when that returns null, `alt` kept; a small client child `ReaderImage` swaps to the alt text in a muted span on `onError`). Truncated → final muted paragraph "The reader view was cut here. The rest is on the original page."
- [ ] **Step 5: Verify** `pnpm typecheck && pnpm lint`, then confirm the bundle rule: `pnpm build` and check that `react-markdown` appears only in the `/read/[id]` route's chunks (`grep -l react-markdown .next/static/chunks/*` against the route manifest), or note it as checked by the e2e network log if the build can't run locally.
- [ ] **Step 6: Commit** `feat: the read page`.

### Task 10: End to end

**Files:**
- Modify: `e2e/support/db.ts`, `e2e/fixtures.ts`
- Create: `e2e/reader-view.spec.ts`

**Interfaces:**
- Produces: `seedReaderView(userId: string, linkId: string, view: { status: "PENDING" | "READY" | "NONE" | "FAILED"; reason?: string; markdown?: string; truncated?: boolean; fetchedAt?: Date }): Promise<void>` in `db.ts` (plain `pg` insert; `claimedAt` now); `seed.readerView(linkId, view)` in the fixture.

- [ ] **Step 1: Write the spec** (local database, no network: links use `https://example.com/...` URLs that are never fetched; stub nothing that isn't needed):
  - `a ready row opens the reader view in the same tab`: seed a link + READY view with Markdown `"## Migration\n\nSwallows fly south.\n\n![A swallow](https://example.com/s.jpg)"`; click the row; URL is `/read/<id>`, page has the `h1` title, the `h2` "Migration", the paragraph, an image with alt "A swallow" (or its alt text after the error fallback), an "Open original" link to the URL with `target="_blank"`; `page.goBack()` returns to `/home`.
  - `the grid card opens it too` (use `chooseView(page, "grid")`).
  - `a link without a view opens the original in a new tab, and its menu says it's being made`: the row's link has `target="_blank"`; the menu's `[data-cy=reader-view-state]` reads "Making the reader view…".
  - `menu lines for NONE and FAILED`; `Try again clears a failed view`: click it, the state then reads "Making the reader view…"; `request.post` to the retry route for a READY link → 409.
  - `search finds words inside the reader view, by prefix`: search "swal" in the omnibox → the link is listed (its title doesn't contain it).
  - `another user's read page is 404, and signed out redirects home` (second user via the existing helpers; `test.use({ signedIn: false })` block).
  - `the shared page never carries the reader view`: make the folder public, open `/@user/slug` signed out, the card's link goes to the original URL and `page.content()` doesn't contain "Swallows fly south".
  - `cron guard` (skip without `CRON_SECRET`): 401 with a wrong bearer; 200 with `{ claimed, ready, none, failed }` numbers.
- [ ] **Step 2: Run** `pnpm test:e2e e2e/reader-view.spec.ts` — fix until green in Chromium and WebKit. Then rerun the neighbours most likely to notice the opener change: `e2e/link-row-phone.spec.ts e2e/owner-grid.spec.ts e2e/bulk-selection.spec.ts e2e/link-notes.spec.ts e2e/shared-folders.spec.ts`.
- [ ] **Step 3: Commit** `test: reader view end to end`.

### Task 11: Docs

**Files:**
- Modify: `CLAUDE.md`, `public/llms.txt`

- [ ] **Step 1: CLAUDE.md:** a "Reader view" bullet under Folders (data and the no-row queue, the cron and its limits, the URL-change reset and retry, opening from rows and cards, the menu state, search, `read_link`, privacy, the dev `curl`); `/read/[id]` in Route groups; the search field's fields mention reader views; the first-load bundle note lists react-markdown/remark-gfm (read page only) and linkedom/Readability (cron only); `reader-views.ts` and `reader-markdown.ts` in the Core library table.
- [ ] **Step 2: llms.txt:** add "Purl keeps a reader view of every saved page, read in Purl and searchable."
- [ ] **Step 3: Full check:** `pnpm lint && pnpm typecheck && pnpm test` — green.
- [ ] **Step 4: Commit** `docs: reader view`.
- [ ] **Step 5: Hand-off note for the user** (no command run by the agent): purl-dev needs `env DOTENV_CONFIG_PATH=.env.local pnpm prisma migrate deploy` before local testing; the API/MCP Notion pages need `readerView` and `read_link`.
