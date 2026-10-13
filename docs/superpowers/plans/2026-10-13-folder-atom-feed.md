# Public Folder Atom Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every public folder serves an Atom 1.0 feed at `/@username/slug/feed.xml`, advertised from the folder page, so anyone can follow a folder in a feed reader.

**Architecture:** A pure `buildAtomFeed` turns the already-public folder data (`resolvePublicFolder` + `listPublicFolderLinks`) into XML. A thin route under `src/app/(shared)/u/[username]/[slug]/feed.xml/` serves it behind a new `next.config.ts` rewrite. The folder page's metadata adds a `rel="alternate"` link for discovery. Nothing new is exposed: only fields in `PUBLIC_LINK_SELECT` / `PUBLIC_OWNER_SELECT` / `PUBLIC_FOLDER_SELECT`.

**Tech Stack:** Next.js App Router route handler, TypeScript, Vitest, Playwright.

**Spec:** none written (bounded change). The approved in-chat design is restated in Global Constraints and the tasks below; the feature extends the "Shared folders" paragraph of `CLAUDE.md`.

## Global Constraints

- **Branch:** `claude/folder-atom-feed` (from `origin/develop`). Never commit to `develop`; re-check `git branch --show-current` before every commit. Do not open a PR or push unless asked.
- **Format:** Atom 1.0 only (no RSS 2.0, no JSON Feed). `Content-Type: application/atom+xml; charset=utf-8`.
- **URL:** `GET /@username/slug/feed.xml`, served by `/u/[username]/[slug]/feed.xml/route.ts` behind a rewrite.
- **Content:** the 50 newest links (`PUBLIC_FOLDER_PAGE_SIZE`) via `listPublicFolderLinks`; no thumbnails, no content bodies, never the folder's internal id.
- **Absolute URLs** come from `process.env.BASE_URL`, falling back to the request's origin; never the `Host` header when `BASE_URL` is set.
- **Feed title** equals the page's: `${emoji} ${name} by @${username}`.
- **Entry id:** `tag:purl.live,2026:link:<link id>`. Feed `<id>` is the absolute folder page URL.
- **Caching/robots:** 200 responses send `Cache-Control: private, max-age=60` (changed after review: a shared cache would keep a folder's feed readable after it is made private) and `X-Robots-Tag: noindex`; 404/308 are not cached.
- **Private or missing folder → 404; renamed username/slug → 308 to the current *feed* URL.**
- No new rate-limit bucket: `/@…` is already public and limited as `public_folder` in the proxy.
- Raw HTML tags are not involved (no UI changes beyond `<head>` metadata). Reicon/Typography rules don't apply.

## Review Focus

- A link title or description holding `&`, `<`, `]]>`, quotes, emoji, control characters (`\u0000`, `\u0008`) or a lone surrogate must still yield well-formed XML (control chars and lone surrogates dropped, the rest escaped).
- An empty folder returns a valid feed (no `<entry>`, `<updated>` present).
- A link with an empty title falls back to its URL; a null description omits `<summary>`.
- A renamed username/slug redirects to `…/feed.xml`, not the page.
- A private or missing folder is a plain 404 with no cache headers and reveals nothing.
- `/@User/Design/feed.xml` (mixed case) resolves like the page does.

---

### Task 1: `buildAtomFeed` and the shared title helper

**Files:**
- Modify: `src/lib/public-folder-path.ts` (add `publicFolderTitle`, `publicFolderFeedPath`)
- Create: `src/lib/atom-feed.ts`
- Test: `src/lib/atom-feed.test.ts`, `src/lib/public-folder-path.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `publicFolderTitle(emoji: string, name: string, username: string): string` → `"🎨 Design by @nublson"`
  - `publicFolderFeedPath(username: string, slug: string): string` → `"/@nublson/design/feed.xml"`
  - `buildAtomFeed(input: { origin: string; owner: PublicOwner; folder: PublicFolder; links: PublicLink[]; now?: Date }): string` (types from `@/lib/public-folders`; `now` only used for an empty folder's `<updated>`, default `new Date()`)
  - `escapeXml(text: string): string` exported from `atom-feed.ts` (drops characters XML 1.0 forbids, then escapes `& < > " '`)

- [ ] **Step 1: Write the failing tests** in `atom-feed.test.ts` (assert on the returned string; no XML library):
  - starts with `<?xml version="1.0" encoding="utf-8"?>` and `<feed xmlns="http://www.w3.org/2005/Atom">`
  - contains `<title>🎨 Design by @nublson</title>`, `<subtitle>` with the folder description (omitted when `description` is null), `<id>https://purl.live/@nublson/design</id>`, `<link rel="self" type="application/atom+xml" href="https://purl.live/@nublson/design/feed.xml"/>`, `<link rel="alternate" type="text/html" href="https://purl.live/@nublson/design"/>`, `<author><name>Nubelson</name></author>`
  - `<updated>` equals the first (newest) link's `createdAt.toISOString()`; an empty folder uses `now.toISOString()` and has no `<entry>`
  - each entry has `<id>tag:purl.live,2026:link:l1</id>`, `<title>`, `<link rel="alternate" href="<saved url>"/>`, `<published>` and `<updated>` both the link's `createdAt`, `<summary type="text">` only when description is non-null
  - an empty title falls back to the link's URL
  - `escapeXml("a & b <c> \"d\" 'e'")` → `a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;`; `escapeXml("x\u0000y\u0008z\ud800w")` → `xyzw`; emoji survive; tab/newline survive
  - a title `"Tom & Jerry ]]> <script>"` appears escaped in the output and the raw `<script>` does not
  - link order is preserved (input is already newest first)
  `public-folder-path.test.ts`: both helpers' exact outputs.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/atom-feed.test.ts src/lib/public-folder-path.test.ts` → FAIL (modules/exports missing).
- [ ] **Step 3: Implement** the helpers in `public-folder-path.ts` (plain string functions, client-safe, no imports) and `atom-feed.ts` (`import "server-only"` not needed; pure). Allowed characters regex: `/[^\x09\x0A\x0D\x20-퟿-�\u{10000}-\u{10FFFF}]/gu` removed before escaping (with the `u` flag a lone surrogate is a code point outside the set, so it is removed). Build with template strings; two-space indentation is optional. Origin is joined with `new URL(path, origin)` so a trailing slash on `origin` is harmless.
- [ ] **Step 4: Run** the same command → PASS; also `pnpm typecheck`.
- [ ] **Step 5: Commit** (`git branch --show-current` must be `claude/folder-atom-feed`):
  ```bash
  git add src/lib/atom-feed.ts src/lib/atom-feed.test.ts src/lib/public-folder-path.ts src/lib/public-folder-path.test.ts
  git commit -m "Build Atom feeds for public folders"
  ```

### Task 2: The route, the rewrite and page discovery

**Files:**
- Create: `src/app/(shared)/u/[username]/[slug]/feed.xml/route.ts`
- Test: `src/app/(shared)/u/[username]/[slug]/feed.xml/route.test.ts`
- Modify: `next.config.ts` (rewrite + redirect), `src/app/(shared)/u/[username]/[slug]/page.tsx` (`generateMetadata`)

**Interfaces:**
- Consumes: `resolvePublicFolder(username, slug)`, `listPublicFolderLinks(ids)` from `@/lib/public-folders`; `buildAtomFeed`, `publicFolderFeedPath`, `publicFolderTitle` from Task 1.
- Produces: `export async function GET(request: NextRequest, context: { params: Promise<{ username: string; slug: string }> }): Promise<Response>`

- [ ] **Step 1: Write the failing route tests** (mock `@/lib/public-folders` with `resolvePublicFolder` and `listPublicFolderLinks`, `vi.mock("server-only", () => ({}))`, `vi.stubEnv("BASE_URL", "https://purl.live")`, same style as `src/app/api/public/folders/[username]/[slug]/route.test.ts`):
  - folder → 200, `Content-Type` `application/atom+xml; charset=utf-8`, `Cache-Control` `private, max-age=60`, `X-Robots-Tag` `noindex`, body contains the folder title and a link's tag id; `listPublicFolderLinks` called with the resolved `ids`
  - `resolvePublicFolder` → `null`: 404, no `Cache-Control` header set to the public value, body has no folder data
  - `{ kind: "redirect", username: "new", slug: "renamed" }` → 308 with `Location` ending `/@new/renamed/feed.xml`
  - with `BASE_URL` unset the feed's `<id>` uses the request origin
- [ ] **Step 2: Run** the test file → FAIL.
- [ ] **Step 3: Implement the route.** `withCdnCache` only receives the request (no route params), so set the cache header directly on the 200 response instead of wrapping; behavior is the same. Redirect with `NextResponse.redirect(new URL(publicFolderFeedPath(username, slug), request.url), 308)`.
- [ ] **Step 4: `next.config.ts`:** add rewrite `{ source: "/@:username/:slug/feed.xml", destination: "/u/:username/:slug/feed.xml" }` beside the existing one, and redirect `{ source: "/u/:username/:slug/feed.xml", destination: "/@:username/:slug/feed.xml", permanent: true }` beside the existing `/u/...` redirect.
- [ ] **Step 5: `page.tsx`:** in `generateMetadata` use `publicFolderTitle(...)` for `title` (same string as today) and add `alternates: { types: { "application/atom+xml": publicFolderFeedPath(owner.username, folder.slug) } }` (resolves against `metadataBase`).
- [ ] **Step 6: Run** `pnpm vitest run` on the new test plus `pnpm typecheck` and `pnpm lint` → PASS (lint warnings unchanged).
- [ ] **Step 7: Commit:**
  ```bash
  git add "src/app/(shared)/u/[username]/[slug]/feed.xml" "src/app/(shared)/u/[username]/[slug]/page.tsx" next.config.ts
  git commit -m "Serve an Atom feed for each public folder"
  ```

### Task 3: e2e and docs

**Files:**
- Modify: `e2e/shared-folders.spec.ts` (add tests inside the signed-out describe), `CLAUDE.md` (Shared folders paragraph)

- [ ] **Step 1: Add e2e tests** (use `page.request.get`, the `seed` fixture and `testUser.username`):
  - public folder with two links (one title `Tom & Jerry <3`): feed → 200, `content-type` contains `application/atom+xml`, body parsed in the page with `new DOMParser().parseFromString(text, "application/xml")` has no `parsererror`, two `entry` elements, `feed > id` ends with `/@<username>/design`, the first entry's `link[rel=alternate]` href is the saved URL, and the `Tom & Jerry <3` title round-trips through the parser
  - empty public folder → 200 with zero `entry`
  - private folder and unknown slug → 404
  - mixed-case path `/@<USERNAME>/Design/feed.xml` → 200
  - the folder page has `link[rel="alternate"][type="application/atom+xml"]` whose `href` ends with `/@<username>/design/feed.xml`
- [ ] **Step 2: Run** `pnpm test:e2e e2e/shared-folders.spec.ts` (Chromium + WebKit) → PASS. If the dev server on :3100 is stale after the `next.config.ts` change, restart it.
- [ ] **Step 3: Docs.** In `CLAUDE.md`'s Shared folders paragraph add: the feed URL and rewrite, the Atom shape (50 newest, entry ids, saved URL as the entry link), caching/`noindex`, the 308 for renames, the discovery `<link>`, and the e2e spec.
- [ ] **Step 4: Full verification:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:e2e` → all green (known flaky: `e2e/reorder-folders.spec.ts:125`).
- [ ] **Step 5: Commit:**
  ```bash
  git add e2e/shared-folders.spec.ts CLAUDE.md
  git commit -m "Test and document the public folder Atom feed"
  ```
