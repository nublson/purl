# Landing Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the landing page's still product panel into a working demo of the real app, reading the `@purl` account's public folders, with the real folder menu, share popover, account menu and link rows/cards in a read-only demo mode.

**Architecture:** A server function reads `@purl`'s public folders for the static (hourly revalidated) landing page. A client `DemoProvider` mounts the app's real providers (links-sync, folders, current folder, current user, link view) with demo data and local state, plus a `DemoModeContext`. Six app components check `useIsDemo()` at their write/navigation points. No demo code calls the app's API.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Prisma 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-landing-demo-design.md` (piece 2; piece 1's spec `2026-10-07-landing-page-design.md` is context)

**Skills:** the final task runs `/better-interface` on the landing page and demo, as the user asked.

## Global Constraints

- `DEMO_USERNAME = "purl"`; `DEMO_LINKS_PER_FOLDER = 20`; demo opens on the folder with slug `reading-list`, else the first folder by name.
- Only public folders and the public fields of `src/lib/public-folders.ts` (`PublicOwner`, `PublicFolder`, `PublicLink`) reach the client; private folders never.
- **No request to the app's API from the demo**: no `/api/links*`, `/api/folders*`, `/api/user/layout`, no `setLinksRead`, no router navigation away from `/`.
- Landing page stays static: `force-static` + `export const revalidate = 3600`. `getDemoFolders` returning `null` → piece 1's `ProductPreview` renders (fallback).
- Exact look: the demo renders the app's real components; disabled items stay visible (rendered `disabled`), row actions (checkbox, long-press, row menu) are absent.
- The signed-in app's behavior is unchanged: every demo branch is `useIsDemo()`, false outside `DemoProvider`.
- Project rules: no new dependencies; text via `Typography`; tokens for colors; comments in plain English at the codebase's density.

## Review Focus

- **Signed-in app regressions** from the demo branches in shared components (folder menu, share popover, account menu, rows, cards): pinned in Task 6 by the full existing e2e suite plus each branch being a single `useIsDemo()` check (reviewed per task).
- **A demo folder with no links** (or all links deleted later): the demo shows the folder's empty state without crashing. Pinned in Task 5 (render check with an empty folder) and Task 6 (e2e seeds an empty public folder).
- **The `@purl` account renames its username or makes a folder private:** the demo follows (only current username, only public folders) and the fallback covers a missing account. Pinned in Task 1 (unit: private excluded, missing user → null).
- **Keyboard shortcuts on the landing page:** digit keys switch demo folders, but must not fire while focus is in the hero's buttons in a way that navigates (no navigation at all in demo). Pinned in Task 3 (unit/e2e: digit key changes demo folder, URL stays `/`).
- **Hydration/no-JS:** the demo is client-rendered; the server HTML must match (same initial folder and view) to avoid hydration warnings. Pinned in Task 6 (console has no hydration errors).

---

### Task 1: Read the demo folders

**Files:**
- Create: `src/lib/demo-folders.ts`, `src/lib/demo-folders.test.ts`
- Read for reuse: `src/lib/public-folders.ts` (types, public selects)

**Interfaces:**
- Produces: `DEMO_USERNAME`, `DEMO_LINKS_PER_FOLDER`; `type DemoFolder = PublicFolder & { id: string; links: PublicLink[] }`; `type DemoData = { owner: PublicOwner; folders: DemoFolder[] }`; `getDemoFolders(username?: string): Promise<DemoData | null>` (default `DEMO_USERNAME`), server-only; `toDemoLinks(folder: DemoFolder): Link[]` mapping `PublicLink` to the app's `Link` (`src/utils/links`; `readAt: null`, `folderId: folder.id`, other required fields filled the way `serializeLink` shapes them) — pure, so it lives here with tests (move it to a non-`server-only` module like `src/lib/demo-links.ts` if the client needs to import it; the client imports types only otherwise).

- [ ] **Step 1: Write failing tests** (mock Prisma like other `src/lib/*.test.ts`): user missing → `null`; user with only private folders → `null`; mixed → returns only `isPublic` folders, ordered by name; each folder's links newest first, at most 20 (the query passes `take: 20`, `orderBy createdAt desc`); returned objects contain only the public fields (no `userId`, `readAt`, `folderId`, owner email); `toDemoLinks` sets `readAt: null` and the folder's id.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/demo-folders.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** with one user lookup by `username` and one folders query (`isPublic: true`, include links), reusing `public-folders.ts`'s field selects so the public field list has one source. `import "server-only"`.
- [ ] **Step 4: Run** the test; expect PASS. `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(landing): read the demo account's public folders`.

### Task 2: Demo mode and providers

**Files:**
- Create: `src/contexts/demo-mode-context.tsx` (`DemoModeContext`, `useIsDemo`, demo current-folder setter), `src/components/landing/demo-provider.tsx`
- Modify only if a seam is needed: `src/contexts/folders-context.tsx`, `src/contexts/link-view-context.tsx`, `src/contexts/current-user-context.tsx`

**Interfaces:**
- Consumes: `DemoData` (Task 1).
- Produces:
  - `useIsDemo(): boolean` (false without a provider).
  - `useDemoFolderSelect(): ((folderId: string) => void) | null` (null outside the demo).
  - `DemoProvider({ data, children }: { data: DemoData; children: ReactNode })`, a client component that mounts `LinksSyncProvider`, `FoldersProvider` (seeded with the demo folders as `FolderSummary[]`, `initialTotalLinks` = sum of links), `CurrentFolderProvider` (local state; initial = `reading-list` slug, else first), `CurrentUserProvider` (demo `SessionUser` from `owner`, `email: ""`; Task 3's account menu shows `@username` in demo), and `LinkViewProvider` (initial `{ view: "list", folderTags: false }`) in a mode where `setView` changes state but never calls `PATCH /api/user/layout`.

- [ ] **Step 1:** Implement the context and provider. For the no-save view mode, add the smallest seam to `link-view-context.tsx` (e.g. an optional `persist?: boolean` prop, default `true`) rather than a parallel provider. Confirm `FoldersProvider` doesn't fetch on mount when seeded and that nothing in the demo triggers a refresh; if `LinksSyncProvider` opens a realtime connection, don't mount it (check first) or confirm it needs a user id it won't have.
- [ ] **Step 2: Verify** `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 3: Commit** `feat(landing): demo mode and its providers`.

### Task 3: Demo branches in the header menus

**Files:**
- Modify: `src/components/folder-select-dropdown.tsx`, `src/components/folder-share-popover.tsx`, `src/components/user.tsx`, `src/components/view-mode-menu.tsx`

**Interfaces:**
- Consumes: `useIsDemo`, `useDemoFolderSelect` (Task 2).

- [ ] **Step 1: Implement**, each as a narrow `useIsDemo()` branch:
  - Folder menu: folder items call `useDemoFolderSelect()(folder.id)` via `onSelect` instead of rendering `<Link>`; the "Home" item, "New folder…", edit and delete render `disabled`; digit shortcuts select demo folders (no `router.push`).
  - Share popover: Public switch `checked` and `disabled`; copy link unchanged (real `origin + publicFolderPath`).
  - Account menu: the header shows name and `@username` (demo user has no email); Settings, Feedback, Sign out `disabled`; View mode works.
  - View-mode menu: `FolderTagsMenuItem` `disabled` in demo.
- [ ] **Step 2: Verify** `pnpm typecheck`, `pnpm lint`, and the existing specs touching these menus pass unchanged: `pnpm exec playwright test e2e/owner-grid.spec.ts e2e/folder-shortcuts.spec.ts e2e/shared-folders.spec.ts`.
- [ ] **Step 3: Commit** `feat(landing): demo mode in the folder, share and account menus`.

### Task 4: Demo branches in rows and cards

**Files:**
- Modify: `src/components/link-item.tsx`, `src/components/link-card.tsx`

- [ ] **Step 1: Implement:** in demo, no checkbox, no long-press select, no row/card menu (`LinkMenu` not rendered; keep the row height as today, e.g. the actions slot stays reserved), and opening/middle-click doesn't call `setLinksRead`. Hover previews unchanged.
- [ ] **Step 2: Verify** `pnpm typecheck`, `pnpm lint`; existing row/card specs pass unchanged: `pnpm exec playwright test e2e/bulk-selection.spec.ts e2e/reading-state.spec.ts e2e/owner-grid.spec.ts e2e/link-row-phone.spec.ts`.
- [ ] **Step 3: Commit** `feat(landing): read-only rows and cards in demo mode`.

### Task 5: The demo in the landing page

**Files:**
- Create: `src/components/landing/landing-demo.tsx`
- Modify: `src/app/(public)/page.tsx` (fetch `getDemoFolders()`, `revalidate = 3600`, fallback), `src/components/landing/product-preview.tsx` (export its frame so the demo reuses it: e.g. `ProductFrame({ header, children })`)

**Interfaces:**
- Consumes: `getDemoFolders`, `DemoProvider`, `toDemoLinks`, the real `FolderSelectDropdown`, `FolderSharePopover`, `User`, `LinkGroup` (or `LinkItem`/`LinkCard` + `groupLinksByDate`).
- Produces: `LandingDemo({ data }: { data: DemoData })`.

- [ ] **Step 1: Implement:** the frame from piece 1 (border, rounded top, mask fade, pearl glow, `data-landing-panel`) with the real header row (folder menu left, share popover + account menu right, same order/sizes as the app header) and the current folder's links grouped by day in the current view; fixed visible height (the page doesn't grow when switching folders); empty folder shows the app's folder empty state; first rows keep `data-landing-row`/`--i` for piece 1's arrival. Page: `data ? <DemoProvider data={data}><LandingDemo data={data} /></DemoProvider> : <ProductPreview />`.
- [ ] **Step 2: Verify** in the browser with a locally seeded `purl` user (write a throwaway seed script using `e2e/support/db.ts` helpers: user `purl`, three public folders incl. `reading-list` and one empty, one private folder; delete it after): list and grid, switching folders, share copy, disabled items, dark and light, 390/1440, no horizontal scroll, no console/hydration errors, no `/api/*` requests in the Network panel. Measure first-load JS on `/` with `pnpm build` before and after this task (gzip of the page's chunks); if it grows by more than ~40KB gz, render the still panel first and mount the demo after first paint (spec "Speed"), and report the numbers.
- [ ] **Step 3: Commit** `feat(landing): live demo in the product panel`.

### Task 6: End-to-end tests and docs

**Files:**
- Create: `e2e/landing-demo.spec.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write** the spec (serial, signed out). `beforeAll` seeds user `purl` (+ cleanup in `afterAll`) with folders: "Reading list" (`reading-list`, public, 3 links), "Getting started" (public, 2 links), "Design engineering" (public, 0 links), "Secret" (private). Because the page revalidates hourly, the dev server renders on request (dev doesn't cache); note it in the spec. Tests:
  - opens on Reading list with its 3 links; "Secret" is absent from the folder menu;
  - choosing "Getting started" in the folder menu shows its links and `page.url()` stays `/`; "New folder…", edit, delete and Home items are disabled;
  - choosing "Design engineering" shows the empty state;
  - pressing digit `3` (or the right index) switches folders, URL stays `/`;
  - share popover: switch `checked` + `disabled`; "Copy" puts `…/@purl/reading-list` on the clipboard (grant clipboard permissions in Chromium; skip clipboard read in WebKit);
  - account menu: View mode → Grid shows cards; no request to `/api/user/layout`; Settings/Feedback/Sign out disabled;
  - clicking a row opens a popup and no request to `/api/links*` is made (track `page.on("request")`);
  - the console has no errors (no hydration mismatch);
  - fallback: with the `purl` user removed (separate test, after cleanup or before seeding), the still panel (`ProductPreview`) renders.
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/landing-demo.spec.ts e2e/landing.spec.ts` (Chromium + WebKit); then the full checks `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`.
- [ ] **Step 3:** CLAUDE.md: the demo (account `@purl`, `getDemoFolders`, hourly revalidate + fallback, `DemoProvider`/`useIsDemo` and the six branches, no API calls).
- [ ] **Step 4: Commit** `test(landing): e2e for the live demo`.

### Task 7: better-interface check

- [ ] **Step 1:** Load `/better-interface` and audit the landing page and demo (list and grid, dark and light, 390 and 1440, keyboard and screen reader names of the demo's menus and disabled items, reduced motion) with a locally seeded `purl` user.
- [ ] **Step 2:** Fix findings that are within the landing page and demo; report others.
- [ ] **Step 3: Run** `pnpm exec playwright test e2e/landing-demo.spec.ts e2e/landing.spec.ts`, `pnpm lint`, `pnpm typecheck`.
- [ ] **Step 4: Commit** `fix(landing): better-interface pass on the demo` (if anything changed).
