# Folders — Design

**Date:** 2026-09-30
**Status:** Approved in brainstorming, pending spec review
**Branch:** `feat/folders-backend` (backend; UI + wiring on a follow-up branch)

## Goal

Let users group their links into **Folders** (topic/project collections). v1 is private organization only. Public sharing comes later and must not need a data migration.

## Decisions

| Topic | Decision |
|---|---|
| Name | "Folder" in UI **and** code (`Folder`, `folderId`, `/api/folders`). An earlier branded name ("Strands") was dropped on 2026-09-30. |
| Membership | A link is in **at most one** folder (`Link.folderId`, nullable). |
| Structure | Flat: no nesting (a `parentId` can be added later without breaking changes). |
| All links | `/home` is unchanged and shows every link. A folder is a filtered view. |
| Owner URL | `/folders/[slug]` (private, signed-in). `/folders` alone redirects to `/home`. |
| Share URL | `/@username/[slug]` is reserved for the **future** sharing feature (read-only public page). Not built in v1. |
| Slug | Generated from the name, unique per user, and follows renames in v1 (nothing public yet). |
| Filing | Saving while on a folder page files the link there. Re-saving an existing URL there **moves** it into the folder. The link menu offers "Move to folder…" and "Remove from folder". |
| Deleting | Asks each time: keep links (they become unfiled) or delete links too. The DB default is `SetNull`. |
| Cap | `MAX_FOLDERS = 100` per user. |
| API/MCP | Minimal: list/create folders; optional `folderId` on save and list. Rename, delete and move stay in the app only. |
| UI ownership | **The user designs (Figma) and builds the screens.** This work delivers the backend, the hooks contract (§6), and thin route/wiring code. It does not design UI. |
| Sequence | Backend first (schema, lib, API, v1/MCP, hooks). The user then builds the screens against the real hooks, and the wiring comes last. |

## Out of scope

Sharing and public pages (`/@username/...`, visibility, share tokens), a `/folders` overview page, folder badges on `/home`, nesting, ordering/pinning folders, and search scoped to a folder.

## 1. Data model

```prisma
model Folder {
  id        String   @id @default(cuid())
  name      String
  slug      String
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  links     Link[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, name])
  @@unique([userId, slug])
  @@index([userId, createdAt])
  @@map("folders")
}

model Link {
  // ...existing fields
  folderId String?
  folder   Folder?  @relation(fields: [folderId], references: [id], onDelete: SetNull)

  @@index([userId, folderId, createdAt])
}

model User {
  // ...existing fields
  folders Folder[]
}
```

- The migration is additive only: a new table, a nullable column, and indexes. It is safe to apply before or after the deploy. It is verified on the local Docker database and **never** run against hosted Supabase by an agent.
- **Names:** trimmed, 1–60 characters. They are unique per user **case-insensitively**: the app checks with `mode: "insensitive"` before writing, and the DB unique constraint is the race backstop.
- **Slugs:** `slugifyFolderName(name)` lowercases, strips accents, turns runs of non-alphanumerics into `-`, trims `-`, and caps at 50 characters. It falls back to `folder` when empty. Collisions get `-2`, `-3`, … (checked against the user's existing slugs).

## 2. Core library: `src/lib/folders.ts`

Every function takes an explicit `userId` and checks ownership. A folder that is unknown **or belongs to someone else** throws `FolderNotFoundError` (mapped to 404, so existence doesn't leak).

- `listFoldersForUser(userId): Promise<FolderSummary[]>`, where `FolderSummary = { id, name, slug, linkCount }`, ordered by name (case-insensitive), using `_count.links`.
- `getFolderBySlug(userId, slug): Promise<FolderSummary | null>`
- `createFolder(userId, name): Promise<FolderSummary>` throws:
  - `FolderNameError` with reason `"empty" | "too_long" | "taken"`
  - `FolderLimitError` at `MAX_FOLDERS` (`src/lib/limits.ts`)
- `renameFolder(userId, id, name): Promise<FolderSummary>`: the slug is regenerated. Renaming to the same name in different case is allowed.
- `deleteFolder(userId, id, { withLinks }): Promise<{ deletedLinks: number }>`: with `withLinks`, the folder and its links are deleted in one transaction. Otherwise only the folder is deleted, and `SetNull` unfiles its links.
- `assertFolderOwned(userId, folderId): Promise<void>`

**Changes to `src/lib/links.ts`:**
- `listLinksForUser(userId, { …, folderId?: string | null })`:
  - `undefined` means all links; a string filters to that folder.
  - Keyset pagination is unchanged.
  - The owning route calls `assertFolderOwned` first.
- `createLinkForUser(userId, url, { folderId?: string })` returns `CreateLinkResult & { moved: boolean }`:
  - A new link is created in the folder.
  - An existing URL is refreshed as today, and when `folderId` is given and differs, it is moved into the folder with `moved: true`.
- `moveLinkToFolder(userId, linkId, folderId: string | null): Promise<Link>`: checks both the link and folder ownership (404 otherwise).
- Serialized links (`serializeLink`) gain `folderId: string | null`.

## 3. HTTP API (session, cookie-only)

These follow `src/app/api/links/route.ts` patterns. Mutations call `broadcastLinksChanged` (no-op without Supabase).

| Route | Behaviour |
|---|---|
| `GET /api/folders` | `200 FolderSummary[]` |
| `POST /api/folders` `{ name }` | `201 FolderSummary`, or `400 { code: "NAME_EMPTY" \| "NAME_TOO_LONG" }`, `409 { code: "NAME_TAKEN" }`, `403 { code: "LIMIT_REACHED", feature: "FOLDER_LIMIT" }` |
| `PATCH /api/folders/[id]` `{ name }` | `200 FolderSummary`, the same 400/409 codes, or `404` |
| `DELETE /api/folders/[id]?withLinks=true` | `200 { deletedLinks }` or `404` |
| `GET /api/links?folderId=` | The existing list, filtered; `404` for a foreign or unknown folder |
| `POST /api/links` `{ url, folderId? }` | The existing save; the response adds `moved: boolean`; `404` for a foreign folder |
| `PATCH /api/links/[id]` `{ folderId: string \| null }` | Added to the existing link PATCH (it already handles url/title/description); `404` for a foreign folder |

Every error body includes `error` with a user-facing message (see §6 copy).

## 4. Public v1 API and MCP (minimal)

- `GET /api/v1/folders` and `POST /api/v1/folders` (API key), with the same shapes and errors as §3.
- `GET /api/v1/links?folderId=` and `POST /api/v1/links { url, folderId? }`.
- **MCP:** a new `list_folders` tool, described as "List the user's folders (collections of saved links) with id, name and link count". `save_link` gains an optional `folderId`, and `list_saved_items` gains an optional `folderId` filter.

## 5. Routes and save flow (thin wiring)

- `src/app/(private)/(app)/folders/[slug]/page.tsx` plus a loader:
  - `getFolderBySlug`, then `notFound()` if it is missing.
  - Renders `HomeShell` with `folderId` and `folder`, and a slot for the user's folder header component.
  - `HomeShell` gains an optional `folderId` prop, passed to `fetchLinksPage` (initial load, pagination and reload).
- `src/app/(private)/(app)/folders/page.tsx` does `redirect("/home")`.
- `src/proxy.ts` already gates everything that isn't public, so there is no change there. Add a test that `/folders/x` redirects signed-out users to `/`.
- **Save flow:** `src/lib/save-link.ts` `saveLink(url, { folderId? })`. Callers (paste handler, header save menu, `LinkInput`) pass `useCurrentFolder()?.id`. Toasts: "Saved to {name}" and "Moved to {name}".

## 6. Hooks contract (what the user's screens consume)

These live in `src/hooks/use-folders.ts`, are client-side, and refresh on the existing links-sync `version`.

```ts
type FolderSummary = { id: string; name: string; slug: string; linkCount: number };
type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

useFolders(): { folders: FolderSummary[]; isLoading: boolean; max: number }
useCurrentFolder(): FolderSummary | null            // from /folders/[slug], else null
useFolderActions(): {
  createFolder(name: string): Promise<ActionResult<FolderSummary>>;   // navigates to the new folder
  renameFolder(id: string, name: string): Promise<ActionResult<FolderSummary>>; // router.replace on slug change
  deleteFolder(id: string, opts: { withLinks: boolean }): Promise<ActionResult<{ deletedLinks: number }>>; // → /home
  moveLink(linkId: string, folderId: string | null): Promise<ActionResult>;     // optimistic removal on folder pages
}
```

**Error copy returned in `error`:**
- "Give your folder a name."
- "Keep it under 60 characters."
- "You already have a folder with that name."
- "You can have up to 100 folders."
- "Something went wrong. Try again."

**Success toasts:** "Folder created", "Folder renamed", "Folder deleted", "Moved to {name}", "Removed from {name}".

## 7. Testing

- **`src/lib/folders.test.ts`** (Prisma mocked):
  - slugify cases: accents, symbols, empty → `folder`, 50-char cap
  - slug collisions → `-2`/`-3`
  - case-insensitive name taken, empty, too long
  - cap at 100
  - foreign or unknown id → `FolderNotFoundError`
  - rename regenerates the slug; a same-name case change is allowed
  - delete with and without links
- **`src/lib/links` tests:**
  - the `folderId` filter composes with the keyset cursor
  - create into a folder
  - re-save moves it (`moved: true`) and does not move when the folder is the same or omitted
  - `moveLinkToFolder` to another folder, to `null`, and for a foreign link or folder
- **Route tests** for `/api/folders`, `/api/folders/[id]`, the `folderId` additions to `/api/links` and `/api/links/[id]`, v1 folders and links, and the MCP `list_folders`, `save_link` and `list_saved_items` additions: 401/400/403/404/409/200 paths.
- **Hooks:** the contract is exercised through route tests plus the user's manual pass. Vitest runs in a node environment, and component tests aren't set up.
- **Migration:** `prisma migrate dev --create-only` then `migrate deploy` on the local Docker database only. Check that deleting a folder unfiles its links.
- **Manual (after wiring):** create, rename and delete (both options), save on a folder page, move and remove from the link menu, the 100 cap, a foreign slug → 404, and `/folders` → `/home`.

## 8. Rollout

1. The additive migration can be applied to production any time before or with the deploy (`prisma migrate deploy` with the production pooler URL). No data backfill is needed.
2. Deploy. Old clients ignore `folderId`.
