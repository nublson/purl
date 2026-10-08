# Folder Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users set a manual folder order (in a "Reorder folders" dialog, the v1 API or MCP) that drives the folder menu, digit shortcuts and folder listings.

**Architecture:** A `position` column on `Folder` (backfilled from today's A–Z order) is the single source of order. `reorderFolders` in `src/lib/folders.ts` rewrites every position from a full id list; app, v1 and MCP are thin wrappers. The client's `FoldersProvider` sorts by position and applies reorders optimistically via a small, testable orchestrator in `src/lib/folder-order.ts`.

**Tech Stack:** Next.js App Router, Prisma (Postgres), Motion (`Reorder`, `useDragControls`), Radix/shadcn dialog, Vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-folder-reorder-design.md`

## Global Constraints

- Migration is additive only: add column with `DEFAULT 0`, backfill, add index. No drops.
- Backfill: `position = ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY lower(name))` (starts at 1).
- Order everywhere: `position asc, name asc` (name case-insensitive on the client: `Intl.Collator(undefined, { sensitivity: "base" })`).
- New folders: `position = (max(position) ?? 0) + 1`, computed inside `createFolder`'s existing advisory-locked transaction.
- Reorder writes `position = index + 1`.
- Reorder input must be exactly the user's folder ids (no missing, extra, duplicate, or foreign ids) → else `400 { code: "INVALID_ORDER" }`.
- Endpoints: `PUT /api/folders/order` (session, `getBrowserSessionUserId`), `PUT /api/v1/folders/order` (API key, `getSessionUser`, `addCors`). Body `{ ids: string[] }`; 200 `{ folders: FolderSummary[] }`.
- MCP tool name: `reorder_folders`, args `{ ids: string[] }`.
- Broadcasting follows the existing pattern: routes and MCP tools call `broadcastLinksChanged`, not the library. (The spec says the lib broadcasts; every other folder write broadcasts from its caller, so we keep that.)
- Copy: menu item "Reorder folders"; dialog title "Reorder folders"; buttons "Cancel" / "Save"; move buttons labelled "Move {name} up" / "Move {name} down"; live region "{name} moved to position {n} of {total}"; error toasts "Couldn't save folder order" and "Your folders changed elsewhere. Try again."
- Icons from `reicon-react` (named imports). No new dependencies.
- The dialog is loaded with `next/dynamic` and preloaded after the menu mounts (pattern: `dialog-folder-form.tsx` `loadEmojiPicker` / `preloadEmojiPicker`).

## Review Focus

1. A second tab adds or deletes a folder, then the first saves a stale order → expect a refresh + "Your folders changed elsewhere" toast, not a 500 or mixed order (Task 5 test `refreshes on INVALID_ORDER`; Task 3 route test).
2. A background folder fetch lands while a reorder is in flight → the optimistic order must not flash back (Task 5: orchestrator bumps the mutation counter before the request; test `marks a local mutation before sending`).
3. Two folders with the same position (old-deploy creates, ties) → stable name order, not random (Task 1 `listFoldersForUser` orderBy test; Task 5 `byPosition` tie test).
4. `ids` body is not an array, contains non-strings, or is empty while the user has folders → 400, never a partial write (Task 2 + Task 3 tests).
5. A user with 0 or 1 folders → no "Reorder folders" item; `reorderFolders(userId, [])` with no folders succeeds as a no-op (Task 2 test `accepts an empty list for a user with no folders`; Task 6 menu condition).

---

### Task 1: `position` column, ordered listing, new folders at the bottom

**Files:**
- Modify: `prisma/schema.prisma` (model `Folder`, ~L73–93)
- Create: `prisma/migrations/20261008120000_folder_position/migration.sql`
- Modify: `src/lib/folders.ts` (`FolderSummary` L35, `toSummary` L101, `listFoldersForUser` L262, `createFolder` L294)
- Modify: `src/lib/demo-folders.ts` (L32 `orderBy`, L59 summary), `src/components/landing/demo-provider.tsx` (L29 mapping)
- Modify: `e2e/support/db.ts` (folder seed, ~L110)
- Test: `src/lib/folders.test.ts`, `src/lib/demo-folders.test.ts`

**Interfaces:**
- Produces: `FolderSummary.position: number`; `listFoldersForUser` returns folders in `position asc, name asc`.

- [ ] **Step 1: Schema + migration.** Add to `Folder` (with the spec's doc comment): `position Int @default(0)` and `@@index([userId, position])`. Write the migration SQL by hand:

```sql
ALTER TABLE "folders" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "folders" f SET "position" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY lower("name"), "id") AS rn
  FROM "folders"
) r
WHERE f."id" = r."id";

CREATE INDEX "folders_userId_position_idx" ON "folders"("userId", "position");
```

Run `pnpm prisma migrate dev` (applies it locally) then `pnpm prisma generate`. Expected: "Already in sync" after applying, no drift prompt.

- [ ] **Step 2: Write failing tests** in `src/lib/folders.test.ts`:
  - `describe("listFoldersForUser")` → `it("orders by position then name in the database")`: asserts `prisma.folder.findMany` called with `expect.objectContaining({ orderBy: [{ position: "asc" }, { name: "asc" }] })` and the result keeps the mock's order (pass rows out of name order, e.g. `Zeta` pos 1, `alpha` pos 2 → `["Zeta", "alpha"]`) and includes `position`.
  - In `describe("createFolder")`: `it("puts a new folder after the last one")`: mock `tx.folder.aggregate` → `{ _max: { position: 7 } }`; assert `create` data has `position: 8`. `it("starts a first folder at 1")`: `_max: { position: null }` → `position: 1`.
  - Add `aggregate` to the prisma mock and its `mockReset` list.
  - `src/lib/demo-folders.test.ts`: the `findMany` call uses `orderBy: [{ position: "asc" }, { name: "asc" }]`.

- [ ] **Step 3: Run** `pnpm vitest run src/lib/folders.test.ts src/lib/demo-folders.test.ts` → FAIL (orderBy/position missing).

- [ ] **Step 4: Implement.** `toSummary` adds `position: row.position`; `listFoldersForUser` passes the `orderBy` above and drops the `.sort`; `createFolder` runs `tx.folder.aggregate({ where: { userId }, _max: { position: true } })` after the cap check and sets `position: (max ?? 0) + 1`. `demo-folders.ts` uses the same `orderBy` and sets `position` on its summaries (and its `DemoFolder` type in `src/lib/demo-links.ts` if that's what flows to `demo-provider.tsx`); `demo-provider.tsx` passes `position` through. Update the `listFoldersForUser` doc comment to "ordered by the user's position, then name".

- [ ] **Step 5: e2e seed.** In `e2e/support/db.ts`'s folder insert, add `"position"` with value `(SELECT COALESCE(MAX("position"), 0) + 1 FROM "folders" WHERE "userId" = $7)`.

- [ ] **Step 6: Run** `pnpm vitest run src/lib && pnpm typecheck` → PASS (fix any other `FolderSummary` literals typecheck flags, e.g. in tests, by adding `position`).

- [ ] **Step 7: Commit** `feat(folders): position column; list by position, new folders last`.

---

### Task 2: `reorderFolders` and `INVALID_ORDER`

**Files:**
- Modify: `src/lib/folders.ts`, `src/lib/folder-errors.ts`
- Test: `src/lib/folders.test.ts`, `src/lib/folder-errors.test.ts`

**Interfaces:**
- Consumes: Task 1 `position`.
- Produces:
  - `export class InvalidFolderOrderError extends Error` (message: "The order must list each of your folders exactly once.")
  - `export async function reorderFolders(userId: string, ids: string[]): Promise<FolderSummary[]>`
  - `mapFolderError` → `400 { error: e.message, code: "INVALID_ORDER" }`

- [ ] **Step 1: Failing tests** (`describe("reorderFolders")`), user's folders mocked as ids `a`, `b`, `c`:
  - `it("writes index + 1 to every folder and returns the new order")`: `["c","a","b"]` → `folder.update` (on `tx`) called with `{ where: { id: "c" }, data: { position: 1 } }`, `a`→2, `b`→3; returns `listFoldersForUser` result.
  - `it("rejects a missing id")` `["a","b"]`, `it("rejects an extra id")` `["a","b","c","x"]`, `it("rejects a duplicate id")` `["a","a","b","c"]` → each throws `InvalidFolderOrderError` and no `update` call.
  - `it("accepts an empty list for a user with no folders")` → no throw, returns `[]`.
  - `folder-errors.test.ts`: `it("maps InvalidFolderOrderError to 400 INVALID_ORDER")`.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/folders.test.ts src/lib/folder-errors.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In one `prisma.$transaction(async (tx) => …)`: take the same `pg_advisory_xact_lock(hashtext(userId))` as `createFolder` (so a concurrent create can't slip in between the check and the writes), `tx.folder.findMany({ where: { userId }, select: { id: true } })`, compare as sets (size equal to `ids.length`, `new Set(ids).size === ids.length`, every id owned), then `tx.folder.update` per id. Return `listFoldersForUser(userId)` after the transaction. Add the error to `mapFolderError` and its doc comment.

- [ ] **Step 4: Run** the same tests → PASS.

- [ ] **Step 5: Commit** `feat(folders): reorderFolders with full-list validation`.

---

### Task 3: `PUT /api/folders/order` and `PUT /api/v1/folders/order`

**Files:**
- Create: `src/app/api/folders/order/route.ts`, `src/app/api/folders/order/route.test.ts`
- Create: `src/app/api/v1/folders/order/route.ts`, `src/app/api/v1/folders/order/route.test.ts`
- Modify: `src/lib/folder-errors.ts` (add `parseFolderOrderBody`)

**Interfaces:**
- Consumes: `reorderFolders`, `mapFolderError` (Task 2).
- Produces: `export function parseFolderOrderBody(body: unknown): string[] | NextResponse` (400 `{ error: "ids must be an array of folder ids" }` unless `body.ids` is an array of strings).

- [ ] **Step 1: Failing tests**, mirroring `src/app/api/folders/route.test.ts` (same mocks for session, `@/lib/folders`, `@/lib/realtime-broadcast`). App route:
  - `401` without a session.
  - `400` for invalid JSON, `{}`, `{ ids: "a" }`, `{ ids: [1] }`; `reorderFolders` not called.
  - `400 INVALID_ORDER` when `reorderFolders` throws `InvalidFolderOrderError`; no broadcast.
  - `200 { folders }` on success; `reorderFolders` called with `(userId, ids)`; `broadcastLinksChanged` called with the user id and the parsed origin header.
  - v1: same cases, plus `OPTIONS` returns the CORS preflight and responses carry CORS headers (copy the assertions from `src/app/api/v1/folders/route.test.ts`).

- [ ] **Step 2: Run** `pnpm vitest run src/app/api/folders/order src/app/api/v1/folders/order` → FAIL (module not found).

- [ ] **Step 3: Implement** both `PUT` handlers following `POST` in their sibling `route.ts` files (JSON parse → `parseFolderOrderBody` → `reorderFolders` → broadcast → `NextResponse.json({ folders })`; errors via `mapFolderError`, else rethrow). v1 adds `OPTIONS` and wraps every response in `addCors`.

- [ ] **Step 4: Run** the tests → PASS; `pnpm lint`.

- [ ] **Step 5: Commit** `feat(api): PUT folders/order (app and v1)`.

---

### Task 4: MCP `reorder_folders`

**Files:**
- Modify: `src/lib/mcp.ts` (`folderErrorContent` ~L130, new `reorderFoldersTool`, `server.tool` registrations ~L327)
- Test: `src/lib/mcp.test.ts`

**Interfaces:**
- Consumes: `reorderFolders`, `InvalidFolderOrderError`.
- Produces: `export async function reorderFoldersTool(userId: string, ids: string[]): Promise<ToolResult>`.

- [ ] **Step 1: Failing tests:**
  - `reorderFoldersTool` returns `jsonContent` of the reordered folders and broadcasts.
  - On `InvalidFolderOrderError` returns an error result whose text contains "exactly once" and "list_folders"; no broadcast.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/mcp.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `folderErrorContent` maps `InvalidFolderOrderError` to `errorContent(\`${e.message} Call list_folders for the current ids.\`)`. Register:
  - `reorder_folders`: description "Set the order of the user's folders. Pass every folder id from list_folders, in the new order; the list must contain each folder exactly once." Schema `{ ids: z.array(z.string()).describe("All folder ids, first to last") }`, hints `{ destructiveHint: false, idempotentHint: true }`.
  - `list_folders` description becomes "List the user's folders (collections of saved links) in the user's order, with id, name, emoji, description, link count and position".

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `feat(mcp): reorder_folders tool`.

---

### Task 5: Client order state and `reorderFolders` action

**Files:**
- Create: `src/lib/folder-order.ts`, `src/lib/folder-order.test.ts`
- Modify: `src/lib/folder-client.ts` (+ `src/lib/folder-client.test.ts`), `src/contexts/folders-context.tsx`, `src/hooks/use-folders.ts`

**Interfaces:**
- Consumes: `PUT /api/folders/order` (Task 3).
- Produces:
  - `folder-order.ts`: `export function byPosition(a: FolderSummary, b: FolderSummary): number`; `export function applyFolderOrder(folders: FolderSummary[], ids: string[]): FolderSummary[]` (reorders and rewrites `position` to `index + 1`); `export async function saveFolderOrder(ids: string[], deps: { previous: FolderSummary[]; setFolders: (f: FolderSummary[]) => void; put: (ids: string[]) => Promise<ActionResult<{ folders: FolderSummary[] }>>; refresh: () => void; notify: (message: string) => void }): Promise<ActionResult<FolderSummary[]>>`
  - `folder-client.ts`: `export function putFolderOrder(ids: string[]): Promise<ActionResult<{ folders: FolderSummary[] }>>` (via `mutate`, verb "save the folder order").
  - Context: `FoldersContextValue.replaceFolders: (folders: FolderSummary[]) => void` (bumps `mutationCountRef`, sets as given).
  - `useFolderActions().reorderFolders(ids: string[]): Promise<ActionResult<FolderSummary[]>>`.

- [ ] **Step 1: Failing tests** in `folder-order.test.ts`:
  - `byPosition`: sorts by position; ties broken by name case-insensitively (`"beta"` before `"Gamma"` at equal positions).
  - `applyFolderOrder`: returns folders in id order with positions 1..n.
  - `saveFolderOrder`:
    - `it("marks a local mutation before sending")`: `setFolders` is called with the applied order before `put` resolves.
    - `it("adopts the server's folders")`: second `setFolders` call gets the response's `folders`.
    - `it("rolls back and toasts on failure")`: `put` → `{ ok: false, error: "x" }` → `setFolders(previous)`, `notify("Couldn't save folder order")`.
    - `it("refreshes on INVALID_ORDER")`: `{ ok: false, code: "INVALID_ORDER", error }` → `setFolders(previous)`, `refresh()` called, `notify("Your folders changed elsewhere. Try again.")`.
  - `folder-client.test.ts`: `putFolderOrder` sends `PUT /api/folders/order` with `{ ids }` and the links-origin headers.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/folder-order.test.ts src/lib/folder-client.test.ts` → FAIL.

- [ ] **Step 3: Implement** `folder-order.ts` and `putFolderOrder`. In `folders-context.tsx` replace `byName` with `byPosition` and add `replaceFolders` to the value and default context. In `use-folders.ts`, `reorderFolders` calls `saveFolderOrder` with `previous: folders`, `setFolders: replaceFolders`, `put: putFolderOrder`, `refresh`, `notify: toast.error`, then `notifyLinksChanged()` on success.

- [ ] **Step 4: Shortcuts.** Add to `src/lib/folder-shortcuts.test.ts`: `it("maps digits to the folders' array order, not name order")` (folders `[Zeta, alpha]` → `2` = Zeta). Should already pass; update `folder-shortcuts.ts` comments mentioning name order.

- [ ] **Step 5: Run** `pnpm vitest run src/lib && pnpm typecheck` → PASS.

- [ ] **Step 6: Commit** `feat(folders): client folder order and reorderFolders action`.

---

### Task 6: "Reorder folders" dialog and menu item

**Files:**
- Create: `src/components/dialog-reorder-folders.tsx`, `src/components/reorder-folders-list.tsx` (the dynamically loaded Motion list)
- Modify: `src/components/folder-select-dropdown.tsx` (`FolderDialog` L45, dialogs render ~L113, menu group L245)

**Interfaces:**
- Consumes: `useFolders`, `useFolderActions().reorderFolders` (Task 5), `applyFolderOrder`.
- Produces: `DialogReorderFolders({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`; `ReorderFoldersList({ folders, onChange }: { folders: FolderSummary[]; onChange: (next: FolderSummary[]) => void })`.

- [ ] **Step 1: Menu.** `FolderDialog` gains `{ kind: "reorder" }`. After "New folder" (and its cap hint), render "Reorder folders" (Reicon arrows icon, e.g. `ArrowUpDown`; check reicon.dev for the exact name) only when `folders.length >= 2`, `disabled={isDemo}`, `onSelect` sets `pendingDialog.current = { kind: "reorder" }`. Render `<DialogReorderFolders>` when `dialog?.kind === "reorder"`. Update the component's doc comment ("in your order").

- [ ] **Step 2: Dialog.** Local `draft` state seeded from `folders` each time it opens. Body: `ReorderFoldersList` loaded with `next/dynamic` (`loadReorderList` + `preloadReorderList` called in an effect from `FolderSelectDropdown` on mount, like `preloadEmojiPicker`), fallback a list of plain rows of the same height. Footer: Cancel (closes) and Save (disabled while `draft` ids equal `folders` ids; on click closes the dialog and calls `reorderFolders(draft.map(f => f.id))` without awaiting; the action handles toasts). Scrollable body (`max-h` with `overflow-y-auto`) so 100 rows fit.

- [ ] **Step 3: List.** `Reorder.Group axis="y" values={folders} onReorder={onChange}` inside `LazyMotion` (match the existing `LazyMotion` usage's feature set; drag needs `domMax`). Each `Reorder.Item value={folder} dragListener={false} dragControls={controls}`: grip button (`onPointerDown={(e) => controls.start(e)}`, `touch-none`, `aria-hidden`, `tabIndex={-1}`; `haptic("selection")` on touch pointer down), `FolderEmoji`, name (`truncate`), Move up / Move down `Button size="icon"` with `aria-label`s from Global Constraints and `<HapticTarget />`. The row is focusable (`tabIndex={0}`); ⌥↑ / ⌥↓ (`event.altKey && ArrowUp/ArrowDown`) move it. After any move, focus the moved row (or the same button if it's still enabled; otherwise the row) and set a `role="status" aria-live="polite"` region's text to "{name} moved to position {n} of {total}".

- [ ] **Step 4: Verify in the browser.** `preview_start` the dev server, sign in, create 3 folders, open the menu → Reorder folders: drag, move buttons, ⌥↑/⌥↓, Cancel, Save; check the menu order and that `2` opens the new first folder. Check phone width (375px): list scrolls, grip drags. Screenshot.

- [ ] **Step 5: Run** `pnpm lint && pnpm typecheck` → clean.

- [ ] **Step 6: Commit** `feat(folders): Reorder folders dialog`.

---

### Task 7: End-to-end tests and docs

**Files:**
- Create: `e2e/reorder-folders.spec.ts`
- Modify: `e2e/landing-demo.spec.ts`, `CLAUDE.md`

- [ ] **Step 1: Write** `e2e/reorder-folders.spec.ts` (use `seed.folder` ×3: Alpha, Beta, Gamma; `waitForHydration` before opening the menu):
  1. `moves a folder to the top with Move up`: Move Gamma up twice, Save; menu rows read Gamma, Alpha, Beta; pressing `2` (menu closed, body focused) navigates to `/folders/gamma`.
  2. `drags a folder by its grip and keeps the order after reload`: drag Alpha's grip below Gamma with `page.mouse` (down, move in steps, up), Save, reload; order Beta, Gamma, Alpha.
  3. `Cancel discards changes`.
  4. `a new folder goes to the bottom after reordering`.
  5. `Alt+ArrowDown moves the focused row and keeps focus`: focus Alpha's row, `Alt+ArrowDown`; Alpha is second and still `:focus`.
  6. `hides Reorder folders with fewer than two folders`: seed one folder; the menu has no "Reorder folders" item.
  - Add to `landing-demo.spec.ts`: the demo folder menu shows "Reorder folders" disabled.

- [ ] **Step 2: Run** `pnpm test:e2e e2e/reorder-folders.spec.ts e2e/landing-demo.spec.ts e2e/folder-shortcuts.spec.ts` → PASS in Chromium and WebKit.

- [ ] **Step 3: Docs.** In CLAUDE.md's Folders section add a "**Folder order:**" bullet (`Folder.position`, A–Z backfill, new folders last, `reorderFolders` full-list rule and `INVALID_ORDER`, app/v1 `PUT .../folders/order`, MCP `reorder_folders`, `DialogReorderFolders` from the folder menu with drag/buttons/⌥↑↓, Save-only, `saveFolderOrder` rollback, e2e file). Change "the first nine folders in menu order, i.e. by name" to "in the user's order", and "(name order)" for the landing demo's public folders to "(the owner's order)".

- [ ] **Step 4: Full check** `pnpm lint && pnpm typecheck && pnpm test` → PASS.

- [ ] **Step 5: Commit** `test(e2e): folder reorder; docs`.
