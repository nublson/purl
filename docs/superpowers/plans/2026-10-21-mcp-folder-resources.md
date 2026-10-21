# Folders as MCP Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purl's MCP server publishes "🏠 All links" and one resource per folder, so Claude's Add → Purl picker can attach a folder's links as Markdown.

**Architecture:** Two data helpers (`getFolderById`, `listLinksForResource`, plus `countLinksForUser`), a pure Markdown/metadata module (`src/lib/mcp-resources.ts`), and `registerPurlResources(server)` in `src/lib/mcp.ts`, which registers two `ResourceTemplate`s with `list` callbacks (All links, then folders), wired next to `registerPurlTools` in the MCP route.

**Tech Stack:** Next.js route via `mcp-handler` 1.1.0, `@modelcontextprotocol/sdk` 1.31.0 (`McpServer.registerResource`, `ResourceTemplate`, `McpError`), Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-mcp-folder-resources-design.md`

## Global Constraints

- URIs: `purl://links` (All links) and `purl://folders/{folderId}` (folder id, never slug).
- `mimeType` is `"text/markdown"` on every list entry and read result.
- All links' name and title: `🏠 All links`. A folder's name and title: `formatFolderLabel(folder)` (`<emoji> <name>`).
- Descriptions are cut to **200** characters with `…` appended only when cut.
- Link order: `createdAt` desc, then `id` desc. Capped at `MAX_SAVED_LINKS` (`src/lib/limits.ts`).
- Day headings: `## YYYY-MM-DD` in **UTC**.
- Content-type labels: `PDF`, `YouTube`, `Audio`. Nothing for `WEB`.
- `RESOURCE_NOT_FOUND = -32002`, message `Folder not found`, identical for missing and foreign ids. URIs matching no template get the SDK's own `-32602`.
- Read-only: no resource handler writes or calls `broadcastLinksChanged`.
- Count copy uses `formatLinkCount` (`1 link` / `N links`) from `src/lib/folder-display.ts`.
- Never commit to `develop`. Work on `feat/mcp-folder-resources`.

## Review Focus

- **Titles with Markdown-breaking characters** (`]`, `[`, `\`, newlines, e.g. a title `Foo]\n(bar)`): the bullet must stay one valid link line. Covered in Task 2 (`escapes titles`).
- **URLs with parentheses or spaces** (Wikipedia's `https://en.wikipedia.org/wiki/Foo_(bar)`): the link target must not end at the first `)`. Covered in Task 2 (`wraps URLs with parentheses`).
- **Links saved just before and after UTC midnight:** they land under different day headings, newest day first. Covered in Task 2 (`groups by UTC day`).
- **A folder id from another account** (a URI shared or guessed): same `-32002` as a missing one, with no links read. Covered in Task 3 (`rejects a foreign folder`).
- **Descriptions exactly 200 characters long, or full of whitespace/newlines:** no `…` at exactly 200, and whitespace collapses to single spaces. Covered in Task 2 (`description cut`).

---

### Task 1: Data helpers

**Files:**
- Modify: `src/lib/folders.ts` (add `getFolderById` beside `getFolderBySlug`, ~line 331)
- Modify: `src/lib/links.ts` (add `ResourceLink`, `listLinksForResource`, `countLinksForUser` near `listLinksForUser`, ~line 969)
- Test: `src/lib/folders.test.ts`, `src/lib/links-crud.test.ts`

**Interfaces:**
- Produces:
  - `getFolderById(userId: string, folderId: string): Promise<FolderSummary | null>`
  - `type ResourceLink = { url: string; title: string | null; description: string | null; domain: string | null; contentType: ContentType; createdAt: Date; folder: { name: string; emoji: string } | null }`. Match nullability to the Prisma `Link` model; if `title`/`domain` are non-null there, keep them non-null.
  - `listLinksForResource(userId: string, opts: { folderId?: string }): Promise<ResourceLink[]>`
  - `countLinksForUser(userId: string): Promise<number>`

- [ ] **Step 1: Write the failing tests**

In `folders.test.ts`, a `describe("getFolderById")` mirroring `getFolderBySlug`'s:
- `returns null when not found`: `findFirst` → `null`; result `null`; `findFirst` called with `where: { id: "f-1", userId: "user-1" }` and the same `include` as `getFolderBySlug`.
- `returns the folder summary when found`: same expectations as `getFolderBySlug`'s found case (the emoji falls back to `DEFAULT_FOLDER_EMOJI`, and `linkCount` comes from `_count.links`).

In `links-crud.test.ts`:
- `listLinksForResource scopes to the user and orders newest first`: `findMany` called with `where: { userId: "user-1" }`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, `take: MAX_SAVED_LINKS`, and a `select` of exactly `url, title, description, domain, contentType, createdAt, folder: { select: { name: true, emoji: true } }`.
- `listLinksForResource filters by folder`: with `{ folderId: "f-1" }`, `where` is `{ userId: "user-1", folderId: "f-1" }`.
- `listLinksForResource normalizes the folder emoji`: a row with `folder: { name: "Reading", emoji: null }` comes back as `folder: { name: "Reading", emoji: "🦪" }`, and `folder: null` stays `null`.
- `countLinksForUser counts the user's links`: `link.count` called with `{ where: { userId: "user-1" } }` and its result returned.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/folders.test.ts src/lib/links-crud.test.ts`
Expected: FAIL. The new functions aren't exported.

- [ ] **Step 3: Implement the three functions**

`getFolderById` is `getFolderBySlug` with `where: { id: folderId, userId }`. `listLinksForResource` does no ownership check: callers load the folder first, and the query is scoped by `userId`. Each gets a one-line doc comment in the file's style.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/folders.test.ts src/lib/links-crud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/folders.ts src/lib/links.ts src/lib/folders.test.ts src/lib/links-crud.test.ts
git commit -m "feat: data helpers for folder MCP resources"
```

---

### Task 2: Markdown builder

**Files:**
- Create: `src/lib/mcp-resources.ts`
- Test: `src/lib/mcp-resources.test.ts`

**Interfaces:**
- Consumes: `ResourceLink` (type-only import from `@/lib/links`), `FolderSummary` (type-only from `@/lib/folders`), `formatFolderLabel` / `formatLinkCount` from `@/lib/folder-display`.
- Produces:
  - `ALL_LINKS_URI = "purl://links"`, `FOLDER_URI_TEMPLATE = "purl://folders/{folderId}"`, `ALL_LINKS_NAME = "🏠 All links"`, `RESOURCE_NOT_FOUND = -32002`
  - `folderResourceUri(id: string): string`
  - `folderResourceDescription(folder: FolderSummary): string` → `"<description> · N links"`, or `"N links"` with no description
  - `allLinksDescription(count: number): string` → `"Every link you've saved, newest first (N links)"`
  - `renderFolderResource(folder: FolderSummary, links: ResourceLink[]): string`
  - `renderAllLinksResource(links: ResourceLink[]): string`

The module has no runtime import of anything `server-only`. Type imports are fine.

- [ ] **Step 1: Write the failing tests**

Use a `link(overrides)` factory. Assert on exact strings. Cases:
- `renders a folder header with description`: a folder `📚 Reading` with description `Articles` and 2 links → starts `"# 📚 Reading\n\nArticles\n\n2 links, newest first.\n\n## "`.
- `renders a folder header without description`: no description line, and `"1 link, newest first."` is singular.
- `renders an empty folder`: exactly `"# 📚 Reading\n\nNo links in this folder yet.\n"` (with description: the description paragraph before it).
- `renders empty All links`: `"# 🏠 All links\n\nNo links saved yet.\n"`.
- `groups by UTC day`: links at `2026-10-20T00:30:00Z` and `2026-10-19T23:30:00Z` → `## 2026-10-20` precedes `## 2026-10-19`, each with its own link.
- `formats a bullet`: `- [Title](https://example.com/a) · example.com`; with `contentType: "PDF"` it ends `· PDF`, `YOUTUBE` → `· YouTube`, `AUDIO` → `· Audio`, `WEB` adds nothing.
- `description cut`: a 201-character description → the second line is two spaces plus the first 200 characters plus `…`. Exactly 200 → no `…`. `"a\n\n  b"` → `  a b`. A null or blank description → no second line.
- `escapes titles`: the title `"Foo]\n[bar\\"` → `[Foo\] \[bar\\\\](…)`, all on one line.
- `falls back to the URL for a blank title`: title `"  "` or null → the link text is the URL.
- `wraps URLs with parentheses`: `https://en.wikipedia.org/wiki/Foo_(bar)` → `](<https://en.wikipedia.org/wiki/Foo_(bar)>)`.
- `omits a missing domain`: domain null → `- [T](u)` with no `· ` before any type label.
- `adds the folder only in All links`: in `renderAllLinksResource`, a filed link ends `· 📚 Reading` (after any type label) and an unfiled one adds nothing. In `renderFolderResource` there's never a folder suffix.
- `describes resources`: `folderResourceDescription` → `"Articles · 42 links"` / `"1 link"`. `allLinksDescription(1)` → `"Every link you've saved, newest first (1 link)"`. `folderResourceUri("abc")` → `"purl://folders/abc"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/mcp-resources.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Implement `src/lib/mcp-resources.ts`**

One private `renderLinks(links, { withFolder })` shared by both renderers. Escape titles by collapsing `\s+` to a space, trimming, then backslash-escaping `\`, `[`, `]` (in that order). Wrap the URL in `<…>` when it matches `/[()\s]/`. Every document ends with one trailing `\n`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/mcp-resources.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-resources.ts src/lib/mcp-resources.test.ts
git commit -m "feat: render folders as Markdown for MCP resources"
```

---

### Task 3: Register the resources, wire the route, docs

**Files:**
- Modify: `src/lib/mcp.ts` (add `registerPurlResources`)
- Modify: `src/app/api/[transport]/route.ts` (call it after `registerPurlTools(server)`)
- Modify: `src/lib/mcp.test.ts` (add `getFolderById`, `listLinksForResource` and `countLinksForUser` to the existing `@/lib/links` / `@/lib/folders` mocks; new `describe("registerPurlResources")`)
- Modify: `CLAUDE.md` (Folders section, the `MCP:` sentence)

**Interfaces:**
- Consumes: Task 1's `getFolderById`, `listLinksForResource`, `countLinksForUser`, `listFoldersForUser`. All of Task 2's exports. `getUserId(extra)` from `mcp.ts`.
- Produces: `registerPurlResources(server: McpServer): void`

Registration (SDK 1.31.0). Both are `ResourceTemplate`s, because the SDK's `resources/list` would list a fixed resource **and** a template entry with the same URI twice, and a fixed resource's metadata can't carry a per-user count. `new UriTemplate("purl://links")` matches only `purl://links` (checked: `{}`), and `purl://folders/{folderId}` doesn't match `purl://folders/` (checked: `null`), so an empty id never reaches Purl. Templates are listed in registration order, so register All links first:
- `server.registerResource("all_links", new ResourceTemplate(ALL_LINKS_URI, { list: listAll }), { title: ALL_LINKS_NAME, mimeType: "text/markdown" }, readAll)`. `listAll` returns `{ resources: [{ uri: ALL_LINKS_URI, name: ALL_LINKS_NAME, title: ALL_LINKS_NAME, description: allLinksDescription(await countLinksForUser(userId)), mimeType }] }`.
- `server.registerResource("folder", new ResourceTemplate(FOLDER_URI_TEMPLATE, { list: listFolders }), { title: "Purl folder", mimeType: "text/markdown" }, readFolder)`. `listFolders` returns one `{ uri: folderResourceUri(id), name: label, title: label, description: folderResourceDescription(folder), mimeType }` per folder from `listFoldersForUser`, where `label = formatFolderLabel(folder)`.

Reads return `{ contents: [{ uri: uri.href, mimeType: "text/markdown", text }] }`. `readFolder(uri, { folderId }, extra)`: `getFolderById(userId, String(folderId))`; for a `null` result, `throw new McpError(RESOURCE_NOT_FOUND, "Folder not found")` without listing links; otherwise `renderFolderResource(folder, await listLinksForResource(userId, { folderId }))`.

- [ ] **Step 1: Write the failing tests**

Capture handlers with a mock server `{ registerResource: vi.fn((...args) => calls.push(args)) }`, the same way the tool tests capture `tool`. `extra = { authInfo: { extra: { userId: "user-1" } } }`.
- `registers All links before the folder template`: names `["all_links", "folder"]`, both `ResourceTemplate`s, with `uriTemplate.toString()` `"purl://links"` and `"purl://folders/{folderId}"`.
- `lists All links first, then folders in order`: with `countLinksForUser` → 3 and `listFoldersForUser` → `[A (📚 Reading, desc "Articles", 2 links), B (🎧 Pods, no desc, 0 links)]`, concatenating the two `list` callbacks' `resources` in registration order equals `[{ uri: "purl://links", name: "🏠 All links", description: "Every link you've saved, newest first (3 links)", … }, { uri: "purl://folders/A", name: "📚 Reading", description: "Articles · 2 links", mimeType: "text/markdown", … }, { uri: "purl://folders/B", name: "🎧 Pods", description: "0 links", … }]`. The empty folder is listed.
- `reads a folder`: `getFolderById` → folder A, `listLinksForResource` → one link; the result's `contents[0]` has `uri: "purl://folders/A"`, `mimeType: "text/markdown"` and `text` equal to `renderFolderResource(A, [link])` (import the real builder). `listLinksForResource` called with `("user-1", { folderId: "A" })`.
- `reads All links`: `contents[0].text` equals `renderAllLinksResource(links)`, and `listLinksForResource` was called with `("user-1", {})`.
- `rejects a foreign folder`: `getFolderById` → `null`; rejects with an `McpError` whose `code` is `-32002` and message contains `Folder not found`; `listLinksForResource` not called.
- `rejects requests without authInfo`: every captured list/read handler, called with `{}` as extra, rejects with `Unauthorized`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/mcp.test.ts`
Expected: FAIL. `registerPurlResources` isn't exported.

- [ ] **Step 3: Implement `registerPurlResources` and call it in the route**

In `route.ts`: `registerPurlTools(server); registerPurlResources(server);`.

- [ ] **Step 4: Run tests, lint and typecheck**

Run: `pnpm vitest run src/lib/mcp.test.ts src/lib/mcp-resources.test.ts && pnpm lint && pnpm typecheck`
Expected: all pass, with no lint errors.

- [ ] **Step 5: Manual check with the MCP Inspector**

With `pnpm dev` running: `npx @modelcontextprotocol/inspector`, connect to `http://localhost:3000/api/mcp` (Streamable HTTP) and complete the OAuth sign-in. Check that List Resources shows "🏠 All links" exactly once, first, then your folders in menu order with descriptions, and that reading a folder and All links shows the Markdown. Reading `purl://folders/nope` gives `-32002`. If the Inspector's OAuth can't complete against localhost, say so in the report and skip; the unit tests stand.

- [ ] **Step 6: Docs**

In CLAUDE.md's Folders section, after the MCP tool list sentence, add one sentence: MCP also publishes read-only **resources** for Claude's Add menu: `purl://links` ("🏠 All links") and `purl://folders/{id}` (one per folder, listed in menu order), each read as Markdown links grouped by UTC day with descriptions cut to 200 characters (`src/lib/mcp-resources.ts`, `registerPurlResources`). Draft the Notion `/docs/mcp` "Resources" paragraph in the final report for the user to paste (not in a file).

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp.ts src/lib/mcp.test.ts "src/app/api/[transport]/route.ts" CLAUDE.md
git commit -m "feat: publish folders as MCP resources for Claude's Add menu"
```

---

### Final check

- [ ] Run: `pnpm test && pnpm lint && pnpm typecheck`. Expected: all pass.
- [ ] After merge to `develop`: in Claude, Add → Purl on dev.purl.live lists the entries, and attaching a folder puts its Markdown in the chat. Record how claude.ai displays them (search, entry limit).
