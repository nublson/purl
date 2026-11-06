# Per-folder view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each folder can keep its own list/grid view (falling back to the account view), changeable from the user menu and the Share popover, and that view is what visitors of its shared page first see, with visitors' own switches remembered per folder.

**Architecture:** A nullable `Folder.linkView` column (`null` = follow the account view) exposed as `FolderSummary.view` and written through `PATCH /api/folders/[id]`. `useLinkView()` composes the account setting with `useCurrentFolder()` to return the page's effective view and routes `setView` to the account (Home) or the folder. The shared page resolves its view on the server from a per-folder visitor cookie, else the folder's view, else the owner's account view.

**Tech Stack:** Next.js App Router, Prisma 7 (Postgres), React context, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-per-folder-view-design.md`

## Global Constraints

- Migration is additive only: `ALTER TABLE "folders" ADD COLUMN "linkView" "LinkView";` (nullable, no default).
- `FolderSummary.view` is the stored value, `"list" | "grid" | null`, never a fallback.
- `PATCH /api/user/layout` is unchanged (account view only).
- v1 `/api/v1/folders*` and MCP folder tools neither accept nor return `view`.
- Invalid `view` on `PATCH /api/folders/[id]` → `400 { error: "view must be \"list\", \"grid\" or null.", code: "INVALID_VIEW" }`.
- Copy, verbatim: menu row **"Same as Home"**; Share popover row label **"View"**, note **"Visitors see it this way, unless they switch."**, plus **" (same as Home)"** appended while following; save failure toast **"Unable to change the view. Try again."** (the existing `viewFailed` wording; the spec's "pattern of `useLinkView`").
- Visitor cookie: name `purl-shared-views`, value entries `<folderId>:l` / `<folderId>:g` joined by `.`, newest first, at most 50 (`MAX_VISITOR_VIEWS`), `path=/; max-age=31536000; samesite=lax`. Writing it also clears the legacy `purl-shared-view` (`max-age=0`).
- Icons Reicon only; named imports from `@radix-ui/*` / `reicon-react`.

## Review Focus

1. **Rapid List/Grid toggling on a folder** → the last choice is what's saved; an older response can't overwrite it, and a failure reverts to the last confirmed value. Test: Task 3 `latest-saver.test.ts`.
2. **Folder deleted or its view changed in another tab/device while open** → the save 404s and reverts with the toast; a remote change arrives with the folder list refetch and the page's layout follows. Test: Task 4 unit (`effectiveView` over `resolveCurrentFolder`'s fresh entry) and Task 8 e2e (second page changes view, first page follows after sync).
3. **Malformed, oversized or legacy cookies** (garbage, `purl-shared-view=list`, 200 entries, duplicate ids, unknown letters) → ignored or trimmed, page renders the owner's view, never throws. Test: Task 6 `shared-folder-view.test.ts`.
4. **Switching folders (digit keys / folder menu) between folders with different views** → layout changes with the folder without reload, and the View menu reflects the new folder. Test: Task 8 e2e.
5. **Account view changed on Home while a folder follows** → the following folder changes too; a folder with its own view doesn't. Test: Task 8 e2e.

---

### Task 1: Store and resolve the folder's view

**Files:**
- Modify: `prisma/schema.prisma` (`Folder`: `linkView LinkView?` with a `///` doc line)
- Create: `prisma/migrations/20261106120000_folder_link_view/migration.sql`
- Modify: `src/lib/link-view.ts`, `src/lib/folders.ts` (`FolderSummary`, `FolderRowWithCount`, `toSummary`, `FolderUpdate`, `updateFolder`)
- Test: `src/lib/link-view.test.ts` (create if missing), `src/lib/folders.test.ts`

**Interfaces:**
- Produces: `effectiveView(folderView: LinkView | null | undefined, accountView: LinkView): LinkView` and `linkViewFromDbOrNull(value: "LIST" | "GRID" | null | undefined): LinkView | null` in `link-view.ts`; `FolderSummary.view: LinkView | null`; `FolderUpdate.view?: LinkView | null`; `updateFolder` writes `linkView` (`null` clears).

- [ ] **Step 1: Write failing tests**
  - `effectiveView("grid", "list") === "grid"`, `effectiveView(null, "grid") === "grid"`, `effectiveView(undefined, "list") === "list"`.
  - `linkViewFromDbOrNull("GRID") === "grid"`, `(null) === null`.
  - `folders.test.ts`: `updateFolder(u, id, { view: "grid" })` calls `tx.folder.update` with `data: { linkView: "GRID" }` and returns `view: "grid"`; `{ view: null }` → `data: { linkView: null }`, returns `view: null`; `updateFolder(u, id, {})` still throws `FolderUpdateEmptyError`; a row without `linkView` maps to `view: null`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/link-view.test.ts src/lib/folders.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Schema + migration SQL from Global Constraints; `pnpm prisma generate`. Add the two helpers; `toSummary` sets `view: linkViewFromDbOrNull(row.linkView)`; `updateFolder` adds `hasView = input.view !== undefined` to the empty check and `data.linkView = input.view === null ? null : linkViewToDb(input.view)`.
- [ ] **Step 4: Run** the same tests + `pnpm typecheck` — expect PASS (typecheck may flag `FolderSummary` literals in tests/demo: add `view: null` there).
- [ ] **Step 5: Commit** `feat: store a view per folder`.

### Task 2: Folder API takes `view`; v1 and MCP don't show it

**Files:**
- Modify: `src/lib/folder-errors.ts` (`parseViewField`), `src/app/api/folders/[id]/route.ts`, `src/lib/folders.ts` (`toApiFolder`), `src/app/api/v1/folders/route.ts`, `src/app/api/v1/folders/[id]/route.ts`, `src/app/api/v1/folders/order/route.ts`, `src/lib/mcp.ts` (`listFoldersTool`, create/update/reorder tools, and the `listFoldersForUser` use at ~line 610 if it serializes folders)
- Test: `src/lib/folder-errors.test.ts`, `src/app/api/folders/[id]/route.test.ts`, v1 folder route tests if present (else a case in `src/lib/folders.test.ts` for `toApiFolder`)

**Interfaces:**
- Consumes: `FolderUpdate.view` (Task 1), `parseLinkView` (existing).
- Produces: `parseViewField(value: unknown): LinkView | null | undefined | NextResponse`; `toApiFolder(folder: FolderSummary): Omit<FolderSummary, "view">`.

- [ ] **Step 1: Write failing tests**
  - `parseViewField(undefined) === undefined`, `("list") === "list"`, `(null) === null`; `("tiles")` and `(1)` return a 400 response with `code: "INVALID_VIEW"`.
  - Route: `PATCH { view: "grid" }` calls `updateFolder(userId, id, expect.objectContaining({ view: "grid" }))` and `broadcastLinksChanged`; `{ view: "tiles" }` → 400 `INVALID_VIEW`, `updateFolder` not called.
  - `toApiFolder({...folder, view: "grid"})` has no `view` key.
- [ ] **Step 2: Run** the test files — expect FAIL.
- [ ] **Step 3: Implement.** `parseViewField` beside `parseIsPublicField` (message from Global Constraints). Route adds `view?: unknown` to the body type and passes `view`. Wrap every v1 folder response and MCP folder tool output in `toApiFolder` (map for lists). v1/MCP inputs stay as they are (no `view`).
- [ ] **Step 4: Run** tests + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: set a folder's view through the folder API`.

### Task 3: Save a folder's view from the client

**Files:**
- Create: `src/lib/latest-saver.ts`, `src/lib/latest-saver.test.ts`, `src/hooks/use-folder-view.ts`
- Modify: `src/lib/folder-client.ts` (`UpdateFolderInput.view?: LinkView | null`)

**Interfaces:**
- Consumes: `patchFolder` (existing), `useFoldersContext().upsertFolder` / `holdFetches` (existing).
- Produces:
  - `createLatestSaver<T>(opts: { confirmed: T; save: (value: T) => Promise<void>; onRevert: (confirmed: T, failed: T) => void }): { set(value: T): void; confirmed(): T }` — saves one at a time, always the latest value, stops when latest equals confirmed; on failure resets latest to confirmed and calls `onRevert`. (The loop `useSavedSetting` already runs, extracted; `useSavedSetting` may adopt it but needn't.)
  - `useSetFolderView(): (folder: FolderSummary, view: LinkView | null) => void` — upserts `{ ...folder, view }` at once; when `persist` (from the link-view context, Task 4 exposes `usePersistLayout()`) is false it stops there; otherwise one `createLatestSaver` per folder id (kept in a ref map), `save` = `patchFolder(id, { view })` throwing on `!ok`, holding `holdFetches()` while a save is in flight, `onRevert` upserts the confirmed view and toasts "Unable to change the view. Try again.".

- [ ] **Step 1: Write failing tests** (`latest-saver.test.ts`, deferred promises):
  - `set("grid")` then `set("list")` while the first save is pending → `save` called with `"grid"` then `"list"`, not more; `confirmed()` ends `"list"`.
  - `set("grid")`, `set("list")` back to the confirmed `"list"` before the first resolves → only one `save` call.
  - First save rejects → `onRevert("list", "grid")` called once, `confirmed()` stays `"list"`, a later `set("grid")` saves again.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/latest-saver.test.ts` — FAIL.
- [ ] **Step 3: Implement** `createLatestSaver`, the input type, then `useSetFolderView`.
- [ ] **Step 4: Run** tests + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: save a folder's view optimistically`.

### Task 4: Effective view in the app and the View menu

**Files:**
- Modify: `src/contexts/link-view-context.tsx`, `src/components/layout-menu-items.tsx` (`ViewMenuItems`)
- Test: covered by Task 8 e2e; unit coverage is `effectiveView` (Task 1)

**Interfaces:**
- Consumes: `effectiveView`, `useCurrentFolder` (`src/hooks/use-folders.ts`), `useSetFolderView`.
- Produces: `useLinkView()` now returns, in addition to today's fields: `view` = effective view for the page; `accountView: LinkView`; `folderView: LinkView | null | undefined` (`undefined` off folder pages); `setView(view)` → account on Home, `useSetFolderView(folder, view)` on a folder page; `followHome(): void` → `useSetFolderView(folder, null)` (no-op off folder pages). `usePersistLayout(): boolean`.

- [ ] **Step 1: Implement `useLinkView`.** The provider keeps holding the account settings (it sits in the `(app)` layout, above `CurrentFolderProvider`); `useLinkView` reads the context, calls `useCurrentFolder()` and `useSetFolderView()` and derives the fields above. `switched` becomes true on any `setView`/`followHome` that changes the effective view. `persist` goes into context for `usePersistLayout`. Folder page first paint is right because `useCurrentFolder()` returns the server-resolved folder (with `view`) during SSR.
- [ ] **Step 2: `ViewMenuItems`.** Radio value stays the effective view. On a folder page (`folderView !== undefined`) add a full-width third `DropdownMenuItem` under the two-column group: "Same as Home", `data-cy="link-view-home"`, `role="menuitemcheckbox"` with `aria-checked={folderView === null}`, a `Check` icon when checked, `onSelect` prevents close and calls `followHome()` (with `haptic("selection")` + `HapticTarget` like its siblings). While `folderView === null` the two view rows show the effective view as current, as today.
- [ ] **Step 3: Run** `pnpm typecheck && pnpm lint && pnpm test` — PASS.
- [ ] **Step 4: Check in the browser** (`pnpm dev`, a folder page): switching List/Grid there leaves Home's view alone; "Same as Home" checks and the folder follows Home.
- [ ] **Step 5: Commit** `feat: each folder page shows and sets its own view`.

### Task 5: View control in the Share popover

**Files:**
- Modify: `src/components/folder-share-popover.tsx`

**Interfaces:**
- Consumes: `useLinkView()` (`view`, `folderView`, `setView`), `ViewToggle` (`src/components/view-toggle.tsx`, props `view`, `onChange`), `useIsDemo`.

- [ ] **Step 1: Implement** a row under the link/copy row: label "View" (`id` referenced by the toggle's group `aria-labelledby`), `ViewToggle` with `view={view}` and `onChange={setView}`, `data-cy="share-view"`, and a muted note "Visitors see it this way, unless they switch." plus " (same as Home)" while `folderView === null`, linked with `aria-describedby`. Enabled while private. Disabled in the demo (`isDemo`). If `ViewToggle` has no `disabled` prop, add one (`disabled` on both buttons).
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint` — PASS; check in the browser that the popover and the user menu stay in step.
- [ ] **Step 3: Commit** `feat: set a folder's view from the Share popover`.

### Task 6: Shared page opens in the folder's view, visitors remembered per folder

**Files:**
- Modify: `src/lib/shared-folder-view.ts`, `src/lib/public-folders.ts` (`resolvePublicFolder`), `src/app/(shared)/u/[username]/[slug]/page.tsx`, `src/components/shared-folder-view.tsx`
- Test: `src/lib/shared-folder-view.test.ts` (create), `src/lib/public-folders.test.ts` (if present; else the resolution case lives in `shared-folder-view.test.ts` via `initialSharedView`)

**Interfaces:**
- Consumes: `effectiveView`, `linkViewFromDb`, `linkViewFromDbOrNull`.
- Produces, in `shared-folder-view.ts`:
  - `SHARED_VIEWS_COOKIE = "purl-shared-views"`, `LEGACY_SHARED_VIEW_COOKIE = "purl-shared-view"`, `MAX_VISITOR_VIEWS = 50`.
  - `readVisitorView(cookie: string | undefined, folderId: string): SharedFolderView | null`.
  - `withVisitorView(cookie: string | undefined, folderId: string, view: SharedFolderView, ownerView: SharedFolderView): string` — drops any entry for `folderId`, prepends `<id>:<l|g>` unless `view === ownerView`, keeps only valid entries, caps at 50.
  - `initialSharedView(cookie: string | undefined, folderId: string, ownerView: SharedFolderView): SharedFolderView` = `readVisitorView(...) ?? ownerView`.
  - `parseSharedFolderView` and `SHARED_FOLDER_VIEW_COOKIE` removed.
- `resolvePublicFolder`'s `kind: "folder"` result gains `view: LinkView` = `effectiveView(linkViewFromDbOrNull(folder.linkView), linkViewFromDb(user.linkView))` (selects `linkView` on both; `PublicFolder`/`PublicOwner` shapes unchanged, so the feed and OG image are untouched).
- `SharedFolderViewProvider` props: `{ folderId: string; ownerView: SharedFolderView; initialView: SharedFolderView; children }`.

- [ ] **Step 1: Write failing tests**
  - `readVisitorView("a:l.b:g", "b") === "grid"`; `("a:l", "c") === null`; `("garbage", "a") === null`; `(undefined, "a") === null`; `("a:x.a:g", "a") === "grid"` (invalid entry skipped).
  - `withVisitorView(undefined, "a", "list", "grid") === "a:l"`; `withVisitorView("b:g.a:l", "a", "grid", "list") === "a:g.b:g"`; `withVisitorView("a:l.b:g", "a", "grid", "grid") === "b:g"` (back to owner's → removed); 60 distinct entries in, one more written → 50 out, newest first.
  - `initialSharedView(undefined, "a", "list") === "list"`; `initialSharedView("a:g", "a", "list") === "grid"`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/shared-folder-view.test.ts` — FAIL.
- [ ] **Step 3: Implement** the helpers; `resolvePublicFolder`'s `view`; the page reads `(await cookies()).get(SHARED_VIEWS_COOKIE)?.value` and passes `initialSharedView(cookie, ids.folderId, view)`, `folderId` and `ownerView={view}` to the provider; the provider's `setView` writes `document.cookie` with `withVisitorView(currentCookie, folderId, next, ownerView)` (empty result → `max-age=0`) and clears the legacy cookie. `SharedFolderSkeleton` already takes the initial view.
- [ ] **Step 4: Run** tests + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: shared folders open in the owner's view, visitors remembered per folder`.

### Task 7: Landing demo opens each folder in its stored view

**Files:**
- Modify: `src/lib/demo-folders.ts` (select `linkView`, `DemoFolder.view: LinkView | null`), `src/components/landing/demo-provider.tsx` (map into `FolderSummary.view`)

**Interfaces:**
- Consumes: `linkViewFromDbOrNull`, `useLinkView` (Task 4; with `persist={false}` `useSetFolderView` only updates the offline `FoldersProvider`).

- [ ] **Step 1: Implement** the select and mapping; `DEMO_LAYOUT.view` stays `"list"` as the demo's account view.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm test` — PASS.
- [ ] **Step 3: Commit** `feat: landing demo folders use their stored view`.

### Task 8: End-to-end coverage and docs

**Files:**
- Modify: `e2e/owner-grid.spec.ts`, `e2e/shared-folders.spec.ts`, `e2e/landing-demo.spec.ts`, `e2e/support/db.ts` (`seed.folder` accepts `view?: "LIST" | "GRID"`), `CLAUDE.md` ("View mode (list or grid)" and "Shared folders" paragraphs)

- [ ] **Step 1: Write the e2e tests**
  - owner-grid: account list; set folder A to grid from the user menu → A is grid (`[data-cy=link-card]` visible), Home and B are list; reload keeps A grid.
  - owner-grid: switch A → B → A with digit keys: layout follows each folder, no reload.
  - owner-grid: A follows Home ("Same as Home" checked); set Home to grid → A is grid; give A its own list → setting Home back to list/grid leaves A list.
  - owner-grid: second page in the same context sets A to list → first page on A follows after the sync.
  - shared-folders: owner sets A's view in the Share popover (`data-cy=share-view`) → user menu reflects it; a signed-out context visiting `/@user/a` gets that view in the server HTML (`page.request.get` and assert the grid/list marker before hydration).
  - shared-folders: visitor switches A to list while B is owner's grid; reload keeps A list, B grid; switching A back to grid removes the cookie entry (`context.cookies()` has no `a:` entry).
  - landing-demo: a seeded `@purl` public folder with `view: "GRID"` opens as a grid.
- [ ] **Step 2: Run** `pnpm test:e2e e2e/owner-grid.spec.ts e2e/shared-folders.spec.ts e2e/landing-demo.spec.ts` — PASS in Chromium and WebKit.
- [ ] **Step 3: Update `CLAUDE.md`** with `Folder.linkView` / `FolderSummary.view`, "Same as Home", the Share popover's View row, `purl-shared-views` replacing `purl-shared-view`, v1/MCP not exposing it.
- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test` — PASS.
- [ ] **Step 5: Commit** `test: per-folder view e2e; docs`.
