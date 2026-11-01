# Reader view — Design

**Date:** 2026-11-01
**Builds on:** the product analysis of 2026-10-31 (export #261, share target #262, notes + search #263 shipped; content rot was the next gap).

## Goal

A saved page outlives the page. Purl keeps a **reader view** of every page link: the article's text and images in Purl's own typography, made in the background shortly after the save, read on a page of its own, and searchable. When the original is gone, the pearl still reads.

## Decisions

Settled with the user during brainstorming:

- **A readable copy, not a snapshot.** Readability extracts the article; Purl keeps Markdown. The page's layout, scripts and chrome are not kept. A faithful HTML snapshot and a Wayback Machine link were both rejected.
- **Automatic, for every page link, in the background.** Insurance only works if it is already there when the page dies. Saves stay as fast as today; a cron makes the views, newest first, and backfills the links that already exist. No per-link action, no account setting.
- **Images are referenced, not stored.** The Markdown keeps the image URLs and loads them from the source site, as the thumbnail does today. Storing images is a later, separate decision; the format does not change for it.
- **The row and the card open it.** A page link with a ready reader view opens `/read/[id]` on a click; everything else keeps today's flow. There is no "Reader view" menu item: the menu shows the view's **state** instead.
- **Searchable, in Postgres.** The Markdown lives in its own table with a full-text index, and the links search matches inside it. `simple` configuration with prefix matching (typing "swal" finds "swallow", in every language), not English stemming.
- **The owner's alone.** The shared folder page, its API, the feed, the preview image, the landing demo and the export never carry a reader view.
- **Name:** reader view. `ReaderView` model, `reader_views` table, `link.readerView`, `src/lib/reader-views.ts`, `GET /api/cron/reader-views`, `/read/[id]`.

Out of scope: storing images, a faithful snapshot, a reader view for PDFs, YouTube, audio, image, video or uploaded pearls, a per-account switch, search snippets, a v1 API endpoint, a reader kind in the media viewer, Wayback links, inline reading on the row or card.

## 1. Data

- Model `ReaderView`, table `reader_views`, additive migration `…_reader_views`:
  - `linkId String @id` → `Link` (`onDelete: Cascade`); `Link.readerView ReaderView?`.
  - `userId String` → `User` (`onDelete: Cascade`), indexed with `status`, for the search and the cron's broadcast.
  - `status ReaderViewStatus`: `PENDING` (claimed by a run), `READY`, `NONE` (no article to read), `FAILED`.
  - `reason String?` for `NONE` and `FAILED`: `not_html`, `no_article`, `unreachable`, `timeout`, `too_large`.
  - `markdown String?` (`null` unless `READY`), `truncated Boolean @default(false)`, `bytes Int?`.
  - `claimedAt DateTime` (set on claim), `fetchedAt DateTime?` (set when the run finishes the link).
  - `tsv Unsupported("tsvector")?`: a generated column written by the migration, `GENERATED ALWAYS AS (to_tsvector('simple', coalesce("markdown", ''))) STORED`, with a GIN index. Prisma never writes it.
- **No row means "not yet"**: that is the queue. A link qualifies when `contentType = 'WEB'` and `fileKey IS NULL`.
- `Link` (`src/utils/links.ts`) gains `readerView: { status: "PENDING" | "READY" | "NONE" | "FAILED"; reason: string | null; fetchedAt: string | null } | null` (`null` until a run claims it). `LinkRow` reads it through `readerView: { select: { status, reason, fetchedAt } }` on every owner-facing list and single-link read (`listLinksForUser`, `GET /api/links/[id]`, `searchLinksForUser`, v1, MCP `list_saved_items`); `mapRowToLink` and `serializeLink` carry it. `PUBLIC_LINK_SELECT` and `listPublicFolderLinks`' copy into `PublicLink` do not: the shared page, the load-more API, the feed and the preview image never see it. The landing demo reads through the public select, so the demo's rows never have one.
- Constants in `src/lib/limits.ts`: `READER_BATCH_SIZE = 20`, `READER_CONCURRENCY = 5`, `READER_FETCH_TIMEOUT_MS = 20_000`, `READER_ABORT_GRACE_MS = 2_000`, `READER_HTML_MAX_BYTES = 5 MB`, `READER_MARKDOWN_MAX_BYTES = 300 KB`, `READER_PENDING_RETRY_MS = 10 minutes`.

## 2. The pipeline

- `GET /api/cron/reader-views` (`src/app/api/cron/reader-views/route.ts`; a Vercel cron, `* * * * *` in `vercel.json`; `Authorization: Bearer $CRON_SECRET`, 503 without the secret and 401 with a wrong one, like the enrich cron; `maxDuration = 120`) runs `buildPendingReaderViews()` (`src/lib/reader-views.ts`) and answers `{ claimed, ready, none, failed }`.
- **Claim, at-most-once.** One statement: `INSERT INTO reader_views (linkId, userId, status, claimedAt) SELECT id, userId, 'PENDING', now() FROM links WHERE contentType = 'WEB' AND fileKey IS NULL AND NOT EXISTS (SELECT 1 FROM reader_views WHERE linkId = links.id) ORDER BY createdAt DESC LIMIT 20 FOR UPDATE SKIP LOCKED RETURNING linkId, userId, url`, plus a second claim of `PENDING` rows whose `claimedAt` is older than `READER_PENDING_RETRY_MS` (a run that died mid-way), up to the same batch, by `UPDATE … SET claimedAt = now() WHERE … FOR UPDATE SKIP LOCKED RETURNING`. Overlapping runs never share a link; a link gets one attempt, plus one retry only if its run never finished it. `FAILED` and `NONE` stay until something resets them.
- **Per link**, `READER_CONCURRENCY` at a time, each under `READER_FETCH_TIMEOUT_MS` with an `AbortSignal` threaded into `safeFetch` (the pool slot waits `READER_ABORT_GRACE_MS` for an aborted lookup to unwind, as enrich does): `safeFetch(url, { headers: { Accept: "text/html,…" }, maxResponseBytes: READER_HTML_MAX_BYTES, signal })`. A status ≥ 400 or a network failure is `FAILED/unreachable`; an abort is `FAILED/timeout`; a non-HTML `Content-Type` is `NONE/not_html`; a body over the cap (Content-Length, or the stream read past it) is `FAILED/too_large`. The HTML is parsed with `linkedom` (`parseHTML`), given the page's final URL as its base; `@mozilla/readability`'s `isProbablyReaderable` then `new Readability(document).parse()`; no article is `NONE/no_article`. The article's `content` HTML goes through `extractReaderMarkdown(html, baseUrl)` (`src/lib/reader-markdown.ts`): a Turndown instance of its own (ATX headings, fenced code, `-` bullets; `script`, `style`, `iframe`, `form`, `nav`, `button`, `svg` removed; links and image `src` resolved to absolute URLs against the base; `data:` and non-http(s) image sources dropped; images keep their `alt`). The Markdown is cut at `READER_MARKDOWN_MAX_BYTES` on a line boundary with `truncated = true`. The row is updated by `linkId` with `status`, `reason`, `markdown`, `truncated`, `bytes`, `fetchedAt`.
- **After the run**, `broadcastLinksChanged(userId)` once per account whose rows changed, so open tabs reload their lists and rows switch to opening the reader view.
- **Resets.** `updateLinkForUser` deletes the link's `reader_views` row when `url` changes (the next run redoes it; the same update that resets `embed`). `POST /api/links/[id]/reader-view/retry` (session; the link must be the user's; only for a `FAILED` row; `getLinkPreviewRateLimiter()` per user, 429) deletes the row and answers `{ ok: true }`. Deleting a link, a folder with links, or an account cascades.
- In dev, crons don't run: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reader-views`.
- New dependencies: `@mozilla/readability`, `linkedom`, `react-markdown`, `remark-gfm`. None is imported by Home's static bundle: the extractor runs in the cron only, and the Markdown renderer only on the read page.

## 3. The read page

- `src/app/(private)/read/[id]/page.tsx`, server-rendered per request (`dynamic = "force-dynamic"`), its own layout outside `(app)` (no app header, no search field, no selection, no `LinksSyncProvider`). It checks the session itself (`getSessionUser()`, signed out → `redirect("/")`) and loads the link with its reader view by id **and** `userId`; a link that isn't the user's is `notFound()`, indistinguishable from a missing one. The proxy already treats `/read` as private (no session cookie → `/`).
- Frame: the static pages' (`BrandMark` linking to `/`, one centered `max-w-[68ch]` column, text left-aligned, the theme following the system), `metadata` with `robots: noindex` and the link's title.
- Top line, muted: the favicon, the domain, "Open original" (an `<a target="_blank" rel="noopener noreferrer">` to `link.url`) and, when ready, "Reader view from October 31, 2026" (`formatUpdatedDate(fetchedAt)`). Then the title as the page's only `h1`.
- `READY`: the Markdown rendered by `ReaderContent` (`src/components/reader-content.tsx`): `react-markdown` with `remark-gfm`, no raw HTML (the default: nothing from the page can run), `components` mapping headings, paragraphs, lists, quotes, code and tables to `Typography`-styled elements, links as `<a target="_blank" rel="noopener noreferrer">`, images as `<img loading="lazy">` through `safeRemoteImgSrc` with their `alt`, a failed image showing its alt text in place. A truncated view ends with a muted line: "The reader view was cut here. The rest is on the original page."
- `NONE`, `FAILED`, `PENDING` and no row: the same frame with one muted paragraph and "Open original": "No article to read on this page." / "This page isn't a web page." (`not_html`) / "Couldn't make a reader view: the page didn't answer." (`unreachable`) / "… it took too long." (`timeout`) / "… the page is too large." (`too_large`) / "Purl is making the reader view. It takes a minute or two." (`PENDING` or no row). A link that doesn't qualify (an upload, a PDF, media) reads "This pearl has no reader view." No "Try again" here: the menu has it.
- Browser Back returns to the list (a client navigation from the row); the `BrandMark` goes home.

## 4. Opening it

- `linkOpensReader(link)` (`src/lib/reader-view.ts`, client-safe): `link.readerView?.status === "READY"` and `linkKind(link) === "page"` (so an embed pearl, whose owner chose live, still opens the viewer) and not an upload.
- `LinkItem` and `LinkCard`: when `linkOpensReader(link)` and not the demo, the row's overlay link and the card's opener are a Next `Link` to `/read/${link.id}` (`prefetch={false}`: hundreds of rows), same tab, in place of the `<a target="_blank">`; Enter on the focused row follows it; while selecting, a click still toggles the row or card (the existing guard); a long-press still selects. Everything else keeps today's flow: a page link without a ready view opens the original in a new tab; image and video pearls open the media viewer; audio plays in place; "Show live" pearls open the viewer; PDFs and YouTube open a new tab. `SharedLinkItem`, `SharedLinkCard` and the demo are untouched.
- The hover preview, rows and cards draw nothing new.

## 5. The state in the menu

- `LinkMenu` (`src/components/link-menu.tsx`), for page links that qualify (`contentType === "WEB"` and not an upload) and not in the demo, ends with a separator and `ReaderViewMenuState` (`src/components/reader-view-menu-state.tsx`): a `DropdownMenuLabel` drawn like the + menu's "Paste to save" hint (muted, not an item), reading by `link.readerView`:
  - `READY`: "Reader view ready · from Oct 31" (`fetchedAt`, short month and day).
  - `null` or `PENDING`: "Making the reader view…"
  - `NONE`: "No article to read on this page." / "This page isn't a web page."
  - `FAILED`: "Couldn't make a reader view: the page didn't answer." (and the other reasons as in §3), followed by one **item**, "Try again", which calls the retry route; while it runs the item is busy (`aria-busy`), on success the label reads "Making the reader view…" and the list reloads (`notifyLinksChanged`); a 429 or failure toasts "Couldn't retry. Try again in a minute."
- "Open in new tab" stays as the way to the original from an article row. Nothing else in the menu changes.

## 6. Search

- `linkQueryWhere(q)` keeps its five-field substring `OR` and takes an optional `readerLinkIds: string[]`: when given and non-empty, the `OR` gains `{ id: { in: readerLinkIds } }`.
- `readerLinkIdsMatching(userId, q)` (`src/lib/reader-views.ts`): `buildReaderTsQuery(q)` turns the query into `to_tsquery('simple', $1)` input: whitespace-separated words, each lowercased, quoted (single quotes doubled, `\` and `:` dropped), given `:*`, joined with `&`; an empty result (only punctuation) means no ids. One `$queryRaw`: `SELECT "linkId" FROM reader_views WHERE "userId" = $1 AND status = 'READY' AND tsv @@ to_tsquery('simple', $2) LIMIT 1000` (the link cap). `listLinksForUser` and `searchLinksForUser` call it when `q` is set and pass the ids, so Home, folder pages, "Search all links", the folder page's Add section and the Add links picker all match inside reader views. Results show no snippet.

## 7. MCP

- One tool, `read_link` (`{ id }`): the link must be the user's; answers `{ status, title, url, markdown }` (`markdown` the reader view's text when `READY`, else `null`; `status` the reader view's, or `"NONE"` with `reason: "not_a_page"` for a link that doesn't qualify). Resources are unchanged: no per-link resources, the folder listings stay links with descriptions. `list_saved_items` carries `readerView` through `serializeLink`.
- The API and MCP Notion pages are the owner's to update: the `readerView` field on link reads, the `read_link` tool.

## 8. Errors and limits

- The cron never throws for one link: each link ends in `READY`, `NONE` or `FAILED`; a failed claim or update logs `[reader] run failed` and ends the run.
- Everything the fetch does goes through `safeFetch` (private addresses refused, redirects capped, the outbound proxy when set); the body is read through the existing `maxBytes` stream guard.
- The retry route: 401 without a session, 404 for a link that isn't the user's, 409 `{ code: "NOT_FAILED" }` when the row isn't `FAILED`, 429 from the limiter.
- No new environment variables.

## 9. Tests

Unit (vitest):
- `extractReaderMarkdown`: fixtures in `src/lib/reader-fixtures/`: an article (headings, a list, a code block, an image with alt, a relative link and image resolved against the base), a page with no article (`NONE/no_article`), a non-HTML answer (`NONE/not_html`), a body over the cap (`FAILED/too_large`), a long article cut at the cap on a line boundary with `truncated`, `data:` images dropped, `script`/`iframe` gone.
- `buildPendingReaderViews`: mocked Prisma and `safeFetch`: a claim batch, a 500 → `unreachable`, an abort → `timeout`, the pending retry after 10 minutes, one broadcast per account.
- `buildReaderTsQuery`: words, quoting, prefix, empty.
- `linkQueryWhere` with and without `readerLinkIds`; `serializeLink` carries `readerView`; `PUBLIC_LINK_SELECT` and `listPublicFolderLinks` have no `readerView`.
- `linkOpensReader`: ready page → true; ready but embed → false; upload / PDF / media → false; no view → false.
- MCP `read_link`: ready, not ready, not the user's. The retry route: the four errors and the delete.
- The cron route's guard (503 / 401 / 200 shape), like `enrich-links`.

e2e (`e2e/reader-view.spec.ts`, local database, no network; a `seed.readerView` helper in `e2e/support/db.ts`):
- A link with a `READY` row: the row opens `/read/[id]` in the same tab, the page shows the title, the Markdown (a heading, a paragraph, an image's alt) and "Open original"; Back returns to Home; the grid's card opens it too.
- A link without a row opens the original in a new tab (today's flow), and its menu reads "Making the reader view…".
- `NONE` and `FAILED` rows: the menu's lines; "Try again" on a `FAILED` row clears it (the menu then reads "Making…") and the route answers 409 on a `READY` one.
- Search: a word only in the reader view lists the link; prefix ("swal") too.
- `/read/[id]` for another user's link is 404; signed out it redirects to `/`.
- The shared page: a `READY` link's card opens the original and the page's HTML holds none of the Markdown.
- The cron route's guard (skipped without `CRON_SECRET`).

## 10. Docs

- CLAUDE.md: a "Reader view" bullet under Folders (data, the pipeline, opening, the menu state, search, privacy, the cron), the search field's fields, MCP `read_link`, the crons list, the new dependencies in the first-load bundle note.
- `public/llms.txt`: "Purl keeps a reader view of every saved page, read in Purl and searchable."
- `vercel.json`: the cron.
- The migration applied by hand to purl-dev before local testing (`env DOTENV_CONFIG_PATH=.env.local pnpm prisma migrate deploy`).

## Files

| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, `prisma/migrations/<ts>_reader_views/migration.sql` (table, enum, generated `tsv`, GIN index) |
| Limits, model | `src/lib/limits.ts`, `src/utils/links.ts`, `src/lib/links.ts` (`LinkRow`, `mapRowToLink`, the selects, `linkQueryWhere`, the `url`-change reset), `src/lib/serialize-link.ts`, `src/lib/reader-view.ts` (`linkOpensReader`) |
| Pipeline | `src/lib/reader-views.ts` (claim, run, `readerLinkIdsMatching`, `buildReaderTsQuery`), `src/lib/reader-markdown.ts`, `src/app/api/cron/reader-views/route.ts`, `vercel.json` |
| Retry | `src/app/api/links/[id]/reader-view/retry/route.ts` |
| Page | `src/app/(private)/read/[id]/page.tsx` (+ `layout.tsx`), `src/components/reader-content.tsx` |
| Opening, menu | `src/components/link-item.tsx`, `src/components/link-card.tsx`, `src/components/link-menu.tsx`, `src/components/reader-view-menu-state.tsx` |
| MCP | `src/lib/mcp.ts` |
| Tests | the unit files beside each module, `src/lib/reader-fixtures/`, `e2e/reader-view.spec.ts`, `e2e/support/db.ts` |
| Docs | `CLAUDE.md`, `public/llms.txt` |
