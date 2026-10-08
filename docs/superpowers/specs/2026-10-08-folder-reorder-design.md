# Folder reorder — design

Date: 2026-10-08
Status: approved in brainstorming, pending spec review

## Goal

Let users put their folders in any order they like. Today folders are always
sorted by name (case-insensitive). The order users set is the order of the
folder menu, of the digit shortcuts (`2`–`9`, `0`), of `GET /api/v1/folders`
and of MCP `list_folders`.

## Decisions

- **Full manual order**, no sort modes or pinning (for now).
- **Edited in a dedicated "Reorder folders" dialog**, not by dragging inside
  the folder dropdown.
- **Existing users keep their current A–Z order** as their starting manual
  order; nothing moves on release.
- **New folders go to the bottom**, so existing digit shortcuts never shift
  when a folder is created.
- **Available in the app, v1 API and MCP.**
- **A reorder request carries the full list of the user's folder ids.** A
  stale list (a folder added or deleted elsewhere) is rejected, never merged.
- Shared folder pages are unaffected (one folder per page). The landing demo
  shows `@purl`'s public folders in its owner's order.

## 1. Data model and server

### Schema

`Folder` gets:

```prisma
/// The user's manual order (ascending). Not unique or contiguous; ties
/// break by name. New folders get max + 1.
position Int @default(0)

@@index([userId, position])
```

Migration (additive):

1. `ALTER TABLE folders ADD COLUMN position INTEGER NOT NULL DEFAULT 0;`
2. Backfill: `position = ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY lower(name))`
   (starts at 1).
3. Create the `(userId, position)` index.

Positions start at 1 so a folder created by the previous deploy during the
release window (which gets the default `0`) is the only kind of row that can
sit at 0; it shows first, which is harmless and fixable by reordering.

### `src/lib/folders.ts`

- `FolderSummary` gains `position: number`.
- `listFoldersForUser` orders in the database by `position asc, name asc`
  and drops the in-memory `localeCompare` sort.
- `createFolder` (already serialized per user for the `MAX_FOLDERS` check)
  sets `position = (max(position) ?? 0) + 1` inside the same transaction.
- New `reorderFolders(userId: string, ids: string[]): Promise<FolderSummary[]>`:
  - Valid only if `ids` is exactly the set of the user's folder ids: no
    missing id, no extra id, no duplicate, no other user's id. Otherwise
    throws `InvalidFolderOrderError`.
  - Writes `position = index + 1` for every folder in one transaction
    (at most `MAX_FOLDERS` = 100 updates).
  - Broadcasts the change through the existing realtime path
    (`realtime-broadcast.ts`) so other tabs refresh their folders.
  - Returns the folders in the new order.
- Deleting a folder leaves a gap in positions; only relative order matters.

### `src/lib/folder-errors.ts`

`mapFolderError` maps `InvalidFolderOrderError` to
`400 { code: "INVALID_ORDER" }`.

### Other readers

- `src/lib/demo-folders.ts` orders by `position asc, name asc` instead of
  `name asc`.

## 2. API

### App

`PUT /api/folders/order` — session auth (`getSessionUser`), 401 without one.

- Body: `{ ids: string[] }`. A missing or non-array `ids`, or non-string
  entries → 400 (invalid body).
- 200: `{ folders: FolderSummary[] }` in the new order.
- 400 `INVALID_ORDER` when the ids don't match the user's folders.

`order` is a static segment, so Next resolves it before `[id]`; folder ids
are cuids and can't collide with it.

### v1

`PUT /api/v1/folders/order` — API-key auth, same body, response and errors.
`GET /api/v1/folders` documents that folders come in the user's order and
include `position`.

### MCP

- New tool `reorder_folders` `{ ids: string[] }`. Description: pass every
  folder id in the desired order; `list_folders` returns the current order.
  Returns the reordered folders; `INVALID_ORDER` surfaces as a tool error
  explaining the list must contain exactly the user's folders.
- `list_folders` description notes the user's order and the `position` field.

## 3. Client

### Entry point

`FolderSelectDropdown` gets a **"Reorder folders"** item after "New folder"
(Reicon arrows icon), shown only with 2+ folders, disabled in the demo
(`useIsDemo`). It opens the dialog through the existing `pendingDialog`
pattern.

### `DialogReorderFolders` (`src/components/dialog-reorder-folders.tsx`)

- Works on a local copy of the folders; nothing is saved until **Save**.
- Each row: grip handle, emoji, name, **Move up** / **Move down** icon
  buttons (disabled at the ends).
- Pointer and touch: Motion `Reorder.Group` / `Reorder.Item` with
  `dragListener={false}` and `useDragControls`, so a drag starts only from
  the grip and the list still scrolls on touch. The list scrolls inside the
  dialog (up to 100 rows); Motion's `Reorder` auto-scrolls the container near
  its edges while dragging.
- Keyboard: the move buttons, and ⌥↑ / ⌥↓ on a focused row. Focus follows
  the moved row. A polite live region announces each move
  ("Reading moved to position 3 of 8").
- Footer: **Cancel** (discards) and **Save** (disabled until the order
  differs from the original). Save closes the dialog once the optimistic
  update is applied.
- Loaded with `next/dynamic` and prefetched after hydration, like the emoji
  picker, so Motion's drag features stay out of Home's first load.
- Haptics: `haptic("selection")` plus `<HapticTarget />` on the move
  buttons; a selection tick when a drag starts on touch.

### State (`src/contexts/folders-context.tsx`, `src/hooks/use-folders.ts`)

- `byName` becomes `byPosition` (position, then name, case-insensitive).
  `upsertFolder` keeps working; new folders arrive with the server's
  max + 1 position.
- New `useFolderActions().reorderFolders(ids)`:
  1. Applies the new order at once (rewriting local positions) and bumps
     `mutationCountRef`, so an in-flight fetch can't overwrite it.
  2. `PUT /api/folders/order`, then replaces the list with the response.
  3. On failure: rolls back and toasts "Couldn't save folder order".
  4. On `INVALID_ORDER`: refreshes folders and toasts that the folders
     changed elsewhere and to try again.
- No Undo toast; the dialog's Cancel covers that.

### Digit shortcuts

`src/lib/folder-shortcuts.ts` already follows the folders array, so digits
map to the user's order. Update its comments, the folder menu's doc comment
and CLAUDE.md ("menu order, i.e. by name" → "menu order, the user's order").

## 4. Testing

### Vitest

- `reorderFolders` (lib): valid order writes `index + 1`; rejects missing,
  extra, duplicate and other users' ids; broadcasts.
- `createFolder` puts the new folder at max + 1 (and 1 for a first folder).
- `listFoldersForUser` orders by position, then name.
- `mapFolderError` maps `InvalidFolderOrderError`.
- App and v1 `PUT .../folders/order` handlers: 401, invalid body, 400
  `INVALID_ORDER`, 200 shape (library mocked, like existing folder route tests).
- MCP `reorder_folders` input validation and error text.
- `byPosition` sort, including ties.
- Client `reorderFolders` action (fetch mocked): optimistic order, server
  response adopted, rollback on 500, refresh on `INVALID_ORDER`, in-flight
  fetch doesn't overwrite.
- `folder-shortcuts` maps digits to array order, not name order.

### Playwright (`e2e/reorder-folders.spec.ts`)

1. Seed three folders; folder menu → Reorder folders; move the last folder
   to the top with Move up; Save; menu order updated; `2` opens that folder.
2. Drag a row by its grip (`page.mouse`), Save, reload; order persists.
3. Cancel discards changes.
4. A folder created after reordering appears at the bottom.
5. ⌥↓ on a focused row moves it and keeps focus on it.
6. `landing-demo.spec.ts`: the demo's folder menu shows Reorder folders
   disabled.

The `seed.folder` fixture (`e2e/support/db.ts`) sets `position` to max + 1
so seeded folders match real creation.

## Rollout

- One additive migration; safe for the release workflow's
  `prisma migrate deploy` gate. The previous deploy ignores the column.
- CLAUDE.md "Folders" gets a "Folder order" bullet: `position` column,
  app/v1 endpoints, MCP `reorder_folders`, the dialog, shortcuts following
  the user's order.

## Out of scope

- Sort modes (A–Z, recent, most links), pinning, an "A–Z" reset button.
- Reordering by drag inside the folder dropdown, or "Move up/down" items in
  the folder menu.
- A keyboard shortcut to open the dialog.
