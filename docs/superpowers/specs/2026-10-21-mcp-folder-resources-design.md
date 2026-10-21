# Folders as MCP Resources — Design

## Problem

Claude's chat composer has an **Add** menu that attaches context from connected apps: Figma, Notion and GitHub each list items you can pick. Purl is already a Claude connector (the MCP server at `/api/mcp`), but it only registers **tools** (`registerPurlTools` in `src/lib/mcp.ts`), so it has nothing to show in that menu. The menu lists MCP **resources**.

**Goal:** Add → Purl lists the user's folders (and an "All links" entry). Picking one attaches that folder's links to the chat as Markdown that Claude can read.

## Decisions

Settled with the user during brainstorming:

- **What gets attached: the link list only.** Title, URL, domain, description and saved date per link. No page fetching or content extraction. Bringing extraction back for this use case is a **separate feature, to be brainstormed later**.
- **Whole folder, kept lean.** Every link in the folder (at most `MAX_SAVED_LINKS` = 1,000), newest first, with descriptions cut to 200 characters. A full account is about 50k tokens, and a typical folder a few thousand. Nothing is silently dropped.
- **Picker entries: "🏠 All links" first, then every folder** in the user's menu order. All links covers unfiled links, which folders alone couldn't attach.
- **Read-only, per user.** It uses the existing connector OAuth. Users see only their own folders, public and private alike. Saving and moving stay tools.
- **Approach: resource templates with `list` callbacks**: one for All links (literal URI), one for folders. Registering a resource per folder isn't possible, because `createMcpHandler` builds the server before the caller is known. `list_changed` notifications are skipped: requests are stateless Streamable HTTP with no stream to push on, and Claude re-lists when the picker opens.
- **URIs use folder ids, not slugs**, so renames keep a URI working.

Out of scope: page content/extraction, change notifications and subscriptions (an attached resource is a snapshot; the footer points to `list_saved_items` for live data), write operations through resources, per-link resources, and pagination of a resource.

## Resources

| URI | Kind | Name |
|-----|------|------|
| `purl://links` | `ResourceTemplate` with a literal URI and a `list` callback (a fixed resource would be listed twice next to a template entry, and couldn't carry a per-user count) | `🏠 All links` |
| `purl://folders/{folderId}` | `ResourceTemplate` with a `list` callback | the folder's emoji and name, e.g. `📚 Reading` |

Both are `mimeType: "text/markdown"`, registered in a new `registerPurlResources(server)` in `src/lib/mcp.ts`, called next to `registerPurlTools` in `src/app/api/[transport]/route.ts`. Handlers resolve the user with the existing `getUserId(extra)`.

### `resources/list`

All links' template is registered first, so its entry comes first, then the folder template's `list` output:

- **All links:** description `Every link you've saved, newest first (N links)` (`N` from a new `countLinksForUser(userId)` in `src/lib/links.ts`; `1 link` in the singular).
- **Each folder**, from `listFoldersForUser(userId)` (order: `position`, then name, the same as the folder menu, digit shortcuts and `list_folders`):
  - `uri`: `purl://folders/<id>`
  - `name` and `title`: `<emoji> <name>`. `FolderSummary.emoji` already falls back to `DEFAULT_FOLDER_EMOJI` (🦪).
  - `description`: `<folder description> · N links` when there's a description, else `N links` (`1 link` in the singular). The count is `FolderSummary.linkCount`.
  - `mimeType`: `text/markdown`
- Empty folders are listed.
- Errors propagate. A failed list is never returned as an empty one.

### `resources/read`

Returns one `text/markdown` content item (`{ uri, mimeType, text }`).

```markdown
# 📚 Reading

Articles to read this week

42 links, newest first.

## 2026-10-20

- [How Postgres advisory locks work](https://example.com/pg-locks) · example.com
  A walk through session vs transaction locks and when each one…
- [Designing calm software](https://calm.tech/essay) · calm.tech · PDF

## 2026-10-18

- [Talk: Local-first in practice](https://youtube.com/watch?v=abc) · youtube.com · YouTube
```

- **Header:** `# <emoji> <name>`, then the folder's description as a paragraph (if set), then `N links, newest first.` (`1 link.` in the singular). An empty folder's header is followed by `No links in this folder yet.` and nothing else.
- **All links** uses the header `# 🏠 All links` with no description line. When there are no links, it says `No links saved yet.`
- **Grouping:** `## YYYY-MM-DD` headings by the link's `createdAt` date in UTC, newest day first. Within a day, links are newest first.
- **Bullet:** `- [<title>](<url>) · <domain>`, then:
  - `· PDF`, `· YouTube` or `· Audio` for those content types (nothing for `WEB`);
  - in **All links only**, `· <folder emoji> <folder name>` for filed links (nothing for unfiled ones);
  - if there's a description, a second line indented two spaces: whitespace collapsed to single spaces, cut to 200 characters with `…` appended when cut.
- **Snapshot footer:** every read (folders, All links, empty ones too) ends with a blank line and one italic line, so Claude and the user know the attached copy doesn't update itself and how to refresh it:
  - folder: `_Snapshot from YYYY-MM-DD HH:MM UTC. For the latest links, use list_saved_items with folderId <id>._`
  - All links: `_Snapshot from YYYY-MM-DD HH:MM UTC. For the latest links, use list_saved_items._`
  The time is the read's time, in UTC.
- **Escaping:** the title has whitespace (including newlines) collapsed to single spaces and `\`, `[` and `]` backslash-escaped. A missing or blank title uses the URL. A URL containing `(`, `)` or whitespace is wrapped in `<…>` so the link target can't break. A missing domain is omitted, along with its `·`.

## Data

A new function in `src/lib/links.ts`:

```ts
listLinksForResource(userId: string, opts: { folderId?: string }): Promise<ResourceLink[]>
```

- It does no ownership check of its own: the read handler has already loaded the folder with `getFolderById` (below), and the query is scoped by `userId` anyway.
- One `findMany`: `where: { userId, folderId? }`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, `take: MAX_SAVED_LINKS`, `select` only `url`, `title`, `description`, `domain`, `contentType`, `createdAt` and, for All links, `folder: { select: { name, emoji } }`.
- `ResourceLink`: those fields, with `folder` normalized to `{ name, emoji } | null`, where `emoji` falls back to `DEFAULT_FOLDER_EMOJI`.

For a folder resource, the header (name, emoji, description, count) comes from a new `getFolderById(userId, folderId): Promise<FolderSummary | null>` in `src/lib/folders.ts`, a twin of the existing `getFolderBySlug` (`findFirst({ where: { id, userId } })` with the link count). `null` means missing or foreign, and the handler turns it into `-32002` before listing links.

## Markdown builder

A new pure module, `src/lib/mcp-resources.ts` (no Prisma, no `server-only` side effects):

- `renderFolderResource(folder: FolderSummary, links: ResourceLink[], now: Date): string`
- `renderAllLinksResource(links: ResourceLink[], now: Date): string` (`now` is passed in, for the snapshot footer, so tests are deterministic)
- `folderResourceUri(id)` and `ALL_LINKS_URI` (the template hands the read callback its `folderId`, so no URI parser is needed)
- `folderResourceDescription(folder)` and `allLinksDescription(count)` for the list entries, reusing `formatFolderLabel` and `formatLinkCount` from `src/lib/folder-display.ts`

## Errors

| Case | Result |
|------|--------|
| No token, invalid token or save-only (`links:save`) token | Already handled: `withMcpAuth(..., { required: true })` and `verifyToken` answer 401. No change. |
| `folderId` unknown, deleted or another user's | `McpError` with code `-32002` (resource not found), message `Folder not found`. Identical for foreign and missing folders, so nothing leaks. |
| URI that matches no resource (wrong scheme, unknown path) | Never reaches Purl's code: the SDK answers `-32602` `Resource <uri> not found`. `purl://folders/` (empty id) matches no template either. A folder URI with an unknown id gets `-32002` from Purl. |
| `extra.authInfo` without `userId` | `getUserId` throws `Unauthorized`, the same as tools. |
| Database error | Propagates. The SDK answers with an internal error, the same as tools. |

SDK 1.31.0 exports no constant for it, so `mcp-resources.ts` defines `RESOURCE_NOT_FOUND = -32002` (the MCP spec's code).

## Testing

Vitest, following the existing patterns (Prisma mocked, `src/vitest.setup.ts` untouched):

- **`src/lib/mcp-resources.test.ts`** (pure): day grouping across UTC midnight, newest first; the description cut at exactly 200 with `…` and no cut at ≤200; whitespace collapsing; title escaping (`[`, `]`, `\`, newlines); a blank title falling back to the URL; a URL with parentheses wrapped in `<…>`; content-type labels (none for WEB); the folder suffix only in All links and only for filed links; the empty-folder and no-links texts; the header with and without a description; singular and plural counts.
- **`src/lib/mcp.test.ts`**: the list returns All links first, then folders in the order `listFoldersForUser` gives, with the expected `name`/`description`/`mimeType`; an empty folder is listed; reading a folder and All links returns the rendered Markdown with `mimeType: "text/markdown"`; an unknown or foreign folder id gives `-32002`; a missing `userId` throws Unauthorized.
- **`listLinksForResource`**: the `where` is scoped to the user (and folder), the order is newest first, `take` is `MAX_SAVED_LINKS`, the `select` contains only the listed fields, and `getFolderById` returns `null` for a foreign or missing id.

**Manual check:** the MCP Inspector against `pnpm dev` (list and read, with a real OAuth token). Then, after merging to `develop`, Claude's Add → Purl on dev.purl.live: confirm the picker lists the entries and attaching one puts the Markdown in the chat. How claude.ai displays custom-connector resources (search, how many it shows) hasn't been verified and gets checked at this step.

## Docs

- CLAUDE.md: add the two resources to the MCP mentions (Folders section).
- `/docs/mcp` is in Notion: draft a short "Resources" paragraph for the user to paste. Notion isn't edited from the code.
- The server card (`src/lib/agent-discovery.ts`) lists no tools or resources, so it doesn't change.
