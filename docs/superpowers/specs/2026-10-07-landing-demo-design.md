# Landing page: live demo in the product panel

Date: 2026-10-07 · Status: approved design, pending spec review

## Context

Piece 1 (`2026-10-07-landing-page-design.md`) shipped the landing hero with a still `ProductPreview` in the app's frame. This is piece 2: the panel becomes a working demo with **the exact look and feel of the real app**, so visitors can browse folders, switch the view and share a real folder link without signing in. Piece 3 (footer pages) is separate. All three pieces are released together.

## Decisions

- **Demo account:** a dedicated Purl account, username **`purl`** (`DEMO_USERNAME = "purl"`, one constant). It is a normal account created through the app's sign-in; its folders are curated in the real app.
- **Data source:** live, read from the account's **public** folders; the landing page stays static and revalidates hourly.
- **Folders:** three, curated in the real app (names/emoji proposed): 🎨 Design engineering, 🦪 Getting started, 📚 Reading list. The menu lists them by name like the app. **The demo opens on 📚 Reading list** (by slug `reading-list`; if absent, the first folder).
- **Approach:** the real components (folder menu, share popover, account menu, link rows and cards) render inside demo versions of their providers, plus one demo flag that the few write/navigation points check. No look-alike copies.

## Data

- New server function `getDemoFolders(username: string): Promise<DemoData | null>` in `src/lib/demo-folders.ts`:
  - Resolves the user by username (current username only; no redirects).
  - Returns `null` when the user doesn't exist or has no public folders.
  - Otherwise `{ owner: PublicOwner, folders: DemoFolder[] }`, where `DemoFolder` is `PublicFolder` (name, slug, emoji, description) plus its links as `PublicLink[]` (newest first, at most `DEMO_LINKS_PER_FOLDER = 20`).
  - Uses the same public-only fields as `src/lib/public-folders.ts` (reuse its selects/types); **private folders and non-public fields never leave the server**.
- The landing page calls it at render; the page keeps `force-static` with `export const revalidate = 3600`.
- **Fallback:** `null` → the page renders piece 1's still `ProductPreview`. This is also what shows before the `@purl` account is set up.

## Rendering

- `LandingDemo` (client) replaces `ProductPreview`'s inside when data exists, in the **same frame** (border, rounded top, mask fade, pearl glow, `data-landing-panel`).
- **Header row:** the real `FolderSelectDropdown`, `FolderSharePopover` and `User` (avatar menu). No `HeaderAddMenu` (+), no search field.
- **List:** the real `LinkItem` rows (list view) or `LinkCard` cards (grid view), grouped by day with headings like the folder page (`LinkGroup` and `groupLinksByDate`, or the same markup). Links from `PublicLink` are mapped to the app's `Link` shape, with `readAt: null` and `folderId` set to the demo folder's id.
- The panel keeps a fixed visible height on the landing page (the list scrolls inside the frame or is clipped by the mask; the page itself doesn't grow when switching to a folder with more links).

## Demo mode

A `DemoProvider` (`src/components/landing/demo-provider.tsx`) wraps the demo and supplies:

- **`DemoModeContext`** with `useIsDemo(): boolean` (false everywhere outside the demo).
- **Folders:** `FoldersProvider`-compatible state from the demo data, where actions (create, update, delete, move) are no-ops that never call the API.
- **Current folder:** local state, starting at Reading list; changing it swaps the list in place.
- **Current user:** a demo user built from `owner` (name, image, username). Public owner fields have no email, so the menu's header shows the name and `@purl` where the app shows the email.
- **View mode:** `LinkViewProvider`-compatible state that changes at once and is **never saved** (no `PATCH /api/user/layout`); folder tags off.

Demo branches inside app components (each a narrow `useIsDemo()` check):

| Component | In demo mode |
|---|---|
| `FolderSelectDropdown` | Selecting a folder sets the demo's current folder (no `<Link>`/router navigation); "New folder…", edit and delete items render **disabled**; digit shortcuts switch demo folders. |
| `FolderSharePopover` | Copy link works with the real URL (`origin + publicFolderPath(user.username, folder.slug)`); the Public switch renders **on and disabled** (locked). |
| `User` (account menu) | Avatar and name from `@purl`; **View mode** works (local); **Folder tags**, Settings, Feedback, Sign out render **disabled**. |
| `LinkItem`, `LinkCard` | Open in a new tab and show hover previews; **no checkbox, no long-press select, no row menu**; opening does **not** call `setLinksRead`. |

**Nothing in the demo calls the app's API.** Any write path the demo can reach is a no-op in demo mode.

## Motion

- First visit: the panel keeps piece 1's arrival (rises in; its first rows arrive one after another, via `data-landing-row` on the demo's first rows or a wrapper).
- Folder and view switches use the app's own transitions (row arrival/view fade).

## Speed

- Measure the landing page's first-load JS before and after (production build). Heavy pieces already load on demand (emoji picker, add-links picker, motion features); hover-preview images load only on hover.
- If the demo adds noticeably to first load, load its interactive parts after first paint (the still `ProductPreview` paints first, then the demo hydrates in its place without layout shift).

## Setup (manual, by the owner)

1. Sign in to Purl with a separate Google or GitHub account and set the username to `purl` (Settings).
2. Create three folders and make each **public**: 📚 Reading list (slug `reading-list`), 🦪 Getting started, 🎨 Design engineering.
3. Add links. Suggested starting points (replace freely):
   - **Reading list:** a long-form essay (e.g. paulgraham.com/greatwork.html), a talk on YouTube, a paper as PDF (e.g. arxiv.org/pdf/1706.03762), a podcast episode.
   - **Getting started:** purl.live/docs/api, purl.live/docs/mcp (piece 3), github.com/nublson/purl, Purl's MCP registry entry.
   - **Design engineering:** interfere.com/blog/how-we-built-interferes-new-website, emilkowal.ski articles, a design-engineering talk.

## Testing

- **Unit** (`src/lib/demo-folders.test.ts`): returns only public folders and public fields; `null` for a missing user and for a user with no public folders; links capped at `DEMO_LINKS_PER_FOLDER`, newest first.
- **e2e** (`e2e/landing-demo.spec.ts`), with a local user seeded with username `purl` (via `e2e/support/db.ts`, created and removed by the spec, run serially) and three public folders + one private folder:
  - the demo renders and opens on Reading list; the private folder never appears;
  - the folder menu switches the list in place (URL stays `/`); New/Edit/Delete are disabled;
  - the share popover copies `…/@<user>/<slug>` and its switch is checked and disabled;
  - the account menu's View mode switches list ↔ grid, and no `PATCH /api/user/layout` is sent;
  - opening a row sends no request to `/api/links*`;
  - with no demo user, the still panel renders (fallback).
- **App regression:** the full e2e suite passes; the signed-in app's folder menu, share popover, account menu and rows behave exactly as before (existing specs).
- After building: a `/better-interface` check of the landing page and demo.

## Files

- Create: `src/lib/demo-folders.ts` (+ test), `src/components/landing/demo-provider.tsx`, `src/components/landing/landing-demo.tsx`.
- Modify: `src/app/(public)/page.tsx` (data + fallback + revalidate), `src/components/folder-select-dropdown.tsx`, `src/components/folder-share-popover.tsx`, `src/components/user.tsx`, `src/components/view-mode-menu.tsx` (if the disabled tags item lives there), `src/components/link-item.tsx`, `src/components/link-card.tsx`; providers only if a demo variant needs a seam (`folders-context.tsx`, `current-folder-context.tsx`, `current-user-context.tsx`, `link-view-context.tsx`).
- `CLAUDE.md`: the demo (account, data, demo flag and its branches).
