# Per-folder view — design

Date: 2026-11-06
Status: approved in brainstorming, awaiting spec review

## Intent

Today the list/grid view is one account-wide setting (`User.linkView`) that
applies to Home and every folder. The owner wants each folder to be able to
keep its own view, for two reasons:

1. **Content differs.** A folder of images or videos reads best as a grid, a
   folder of articles as a list. Set once per folder, then left alone.
2. **Shared folders.** The view the owner picks for a folder is the view
   visitors first see on its shared page.

Success: a folder set to grid opens as grid for the owner (Home and other
folders unaffected), opens as grid for a first-time visitor of its shared
page, and nothing changes for folders the owner never touches.

## Decisions

- **The account view becomes the default.** Home keeps the account view. A
  folder follows it (`null`) until the owner picks a view on that folder's
  page; from then on the folder keeps its own. A folder can go back to
  following ("Same as Home").
- **One folder setting, two places to change it:** the user menu's View
  group on the folder page, and a View control in the folder's Share popover.
  No separate visitor-only view.
- **Visitors' choice is remembered per folder.** A visitor who switches a
  shared folder's view sees that folder their way next time; other folders
  still open in the owner's view.
- **A shared folder that follows Home** opens in the owner's account view,
  not the fixed grid it uses today.

## 1. Data and API

**Schema.** `Folder.linkView LinkView?` (reuses the `LinkView` enum, `LIST` /
`GRID`). `null` = follows the account view. Additive migration; existing
folders read `null`, so nothing changes until a view is picked.

**`FolderSummary`** gains `view: "list" | "grid" | null`: the stored value,
no fallback, so the client can tell "own view" from "following".

**Resolution** lives in one pure function in `src/lib/link-view.ts`:
`effectiveView(folderView, accountView)` → `folderView ?? accountView`.

**Writes.** `updateFolder` and `PATCH /api/folders/[id]` accept
`view: "list" | "grid" | null` (`null` returns the folder to following).
Anything else is `400 { code: "INVALID_VIEW" }`, parsed by `parseViewField`
(same pattern as `parseIsPublicField`). A view change is a folder write: it
calls `broadcastLinksChanged`, so other tabs and devices pick it up, and for
`@purl` it also revalidates the landing demo.

`PATCH /api/user/layout` is unchanged: it only ever saves the account view.

**Not exposed (for now):** v1 `/api/v1/folders` and MCP `update_folder` /
`list_folders` neither accept nor return `view`. The v1 response shape stays
as it is.

**Shared page read.** `resolvePublicFolder` already loads the folder row; it
additionally selects `Folder.linkView` and the owner's `User.linkView`. No
new query.

## 2. The owner's UI

**Effective view.** `useLinkView().view` returns the view for the current
page: the account view on Home; on a folder page
`effectiveView(currentFolder.view, accountView)` from `FoldersProvider`, so it
follows folder switches (digit shortcuts included). The folder page resolves
its folder on the server, so first paint is in the right view.
`LinkViewFrame`, `HomeSkeleton` and the list/grid components keep reading
`useLinkView()` unchanged.

**User menu, View group (`ViewMenuItems`).**
- Home: unchanged. List / Grid set the account view (the default for every
  folder that follows it).
- Folder page: List / Grid set that folder's view. A third row, **"Same as
  Home"**, is checked while the folder follows the account view; choosing it
  sends `view: null`. The menu stays open, as today.

**Share popover (`FolderSharePopover`).** Under the Public switch and link, a
**View** row with the shared page's segmented List / Grid control
(`ViewToggle`) and a muted note: "Visitors see it this way, unless they
switch." While the folder follows Home, the effective view is shown selected
and the note adds "(same as Home)". Returning to "Same as Home" is only in
the user menu. The control works while the folder is private (it is the same
setting the owner sees on the folder page).

**Saving.** `useFolderActions().updateFolder({ view })` updates
`FoldersProvider` at once and saves; on failure it reverts and toasts
"Couldn't change the view" (the `useLinkView` pattern). The menu and the
popover read the same folder state, so they stay in step.

**Landing demo.** Each `@purl` folder opens in its stored view (through
`effectiveView` with the demo account's view). The demo's View switch stays
local state; the Share popover's View control is disabled, like its locked
Public switch.

## 3. The shared page

**Initial view:** the visitor's remembered choice for this folder, else the
folder's view, else the owner's account view. Resolved on the server in the
page (folder row + cookie), so the first paint is right and
`SharedFolderSkeleton` streams in the same view.

**Visitor memory.** Cookie `purl-shared-views`: entries `<folderId>:l` or
`<folderId>:g`, joined by `.`, most recent first, capped at 50 (~1.4 KB).
Keyed by folder id, so renames keep the choice. When a visitor switches back
to the owner's view, their entry is **removed** (they only override where
they differ, and later owner changes reach them). The old `purl-shared-view`
cookie is ignored and cleared on the next write. Pure helpers in
`src/lib/shared-folder-view.ts`: `readVisitorView(cookie, folderId)` and
`withVisitorView(cookie, folderId, view, ownerView)`.

**Provider.** `SharedFolderViewProvider` takes the folder id and the owner's
effective view alongside the initial view; `SharedFolderViewToggle` writes
the cookie through `withVisitorView`. Its look and behaviour are otherwise
unchanged.

**Unchanged:** the load-more API, the Atom feed and the OG preview image. An
owner's change doesn't move an open visitor page; it applies on their next
load. The owner viewing their own `/@…` page is a visitor there: the toggle
writes the cookie and never changes the folder.

## 4. Testing

**Unit (Vitest).**
- `effectiveView`: folder view wins; `null` falls back.
- `parseViewField`: list / grid / `null` accepted; anything else → 400
  `INVALID_VIEW`.
- `updateFolder` with `view`, including `null` (Prisma mocked); the
  `PATCH /api/folders/[id]` route passes it through and rejects bad values.
- Cookie helpers: read, write, the 50 cap, newest first, removal when equal
  to the owner's view, malformed and legacy values ignored.
- Shared page resolution order: cookie → folder → owner's account.

**e2e (Playwright),** extending `e2e/owner-grid.spec.ts` and
`e2e/shared-folders.spec.ts`:
- Account list, folder A set to grid: A is grid, Home and B stay list, a
  reload keeps it.
- "Same as Home" returns A to the account view and follows later account
  changes.
- Setting the view from the Share popover is reflected in the user menu and
  on a signed-out visit to `/@user/a`.
- Visitor memory: a visitor switches A to list while B keeps the owner's
  grid; it holds across reloads; switching back to the owner's view drops the
  override.
- First paint: the server HTML already has the right layout (asserted on the
  response before hydration).
- Fixtures: `seed.folder` creates folders with `linkView` null, so existing
  tests are unaffected; the reset to list / tags off stays as is.
- `e2e/landing-demo.spec.ts`: a `@purl` folder stored as grid opens as grid.

## Out of scope

- `view` on v1 and MCP folder endpoints.
- A visitor-only view separate from the folder's view.
- Other per-folder layout settings (sort order, folder tags).

## Docs

`CLAUDE.md`'s "View mode (list or grid)" and "Shared folders" paragraphs are
updated with the change.
