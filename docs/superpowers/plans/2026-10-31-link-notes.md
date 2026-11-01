# Link Notes and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A link carries an optional private note, written in the Edit dialog (and by the APIs and MCP `save_link`), shown in the hover preview and marked on rows and page cards, and the search matches notes and descriptions as well as title, domain and URL.

**Architecture:** One nullable `notes` column on `Link`, normalized by a pure helper and written through the existing single-update paths (`updateLinkForUser`, `insertResolvedLink`). Every owner-facing read carries it through `mapRowToLink` / `serializeLink`; the public select never does. Search widens the one `linkQueryWhere` clause every list and search reuses.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Postgres), Zod (MCP), Radix/shadcn UI, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-link-notes-design.md`

## Global Constraints

- `MAX_LINK_NOTES_LENGTH = 2000` (characters, `.length`, after trim); error message "Keep the note to 2,000 characters or fewer."; HTTP code `INVALID_NOTES` (400).
- A note is trimmed; empty → `null`; inner whitespace and line breaks kept.
- `notes` is never selected by `PUBLIC_LINK_SELECT`, never written by scraping, the enrich cron, a URL change or a duplicate-URL refresh.
- Icons are Reicon (`reicon-react`), named imports only; the mark is `Memo`.
- Migrations are additive; name `20261031120000_link_notes`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit on `develop`; the branch is `feat/link-notes`.

## Review Focus

1. A note containing a NUL character (`\u0000`): Postgres `TEXT` rejects it and Prisma would answer 500. `normalizeLinkNotes` strips control characters other than tab, line feed and carriage return (Task 1 tests it).
2. A note of exactly 2,000 characters is accepted and 2,001 is refused (Task 1 tests the boundary).
3. `notes` sent as a number or an object on PATCH/POST: 400 "Invalid notes", never a 500 (Task 3 tests it).
4. A PATCH that changes `url` and sends `notes` together: the re-scrape keeps the new note (Task 2 tests it).
5. MCP `save_link` with `notes` for a URL already saved: the existing note stays, the new one is ignored (Task 2 tests the reuse path).

---

### Task 1: The column, the normalizer and the owner-facing shape

**Files:**
- Modify: `prisma/schema.prisma` (`model Link`, after `description String?`)
- Create: `prisma/migrations/20261031120000_link_notes/migration.sql`
- Modify: `src/lib/limits.ts`, `src/lib/links.ts` (`mapRowToLink`), `src/utils/links.ts` (`Link`), `src/lib/serialize-link.ts`
- Test: `src/lib/links.test.ts`, `src/lib/serialize-link.test.ts`, `src/lib/public-folders.test.ts`

**Interfaces:**
- Produces: `MAX_LINK_NOTES_LENGTH` (limits); `normalizeLinkNotes(notes: string | null | undefined): string | null` and `class LinkNotesError extends Error` (`name = "LinkNotesError"`) in `src/lib/links.ts`; `Link.notes: string | null`; `serializeLink(...).notes`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/links.test.ts`, a `describe("normalizeLinkNotes")`:

```ts
expect(normalizeLinkNotes(undefined)).toBeNull();
expect(normalizeLinkNotes("   \n ")).toBeNull();
expect(normalizeLinkNotes("  keep\n\nthese  lines  ")).toBe("keep\n\nthese  lines");
expect(normalizeLinkNotes("a\u0000b\u0007c\td")).toBe("abc\td");
expect(normalizeLinkNotes("x".repeat(2000))).toHaveLength(2000);
expect(() => normalizeLinkNotes("x".repeat(2001))).toThrow(LinkNotesError);
expect(() => normalizeLinkNotes("x".repeat(2001))).toThrow("Keep the note to 2,000 characters or fewer.");
```

In `src/lib/serialize-link.test.ts`: a row with `notes: "mine"` serializes with `notes: "mine"`, and a row without the key serializes with `notes: null`.

In `src/lib/public-folders.test.ts`: `expect(PUBLIC_LINK_SELECT).not.toHaveProperty("notes")`.

- [ ] **Step 2: Run them**

Run: `pnpm vitest run src/lib/links.test.ts src/lib/serialize-link.test.ts src/lib/public-folders.test.ts`
Expected: FAIL (`normalizeLinkNotes` not exported; `notes` undefined).

- [ ] **Step 3: Schema and migration**

Add `notes String?` to `model Link` under `description`. Migration SQL: `ALTER TABLE "links" ADD COLUMN "notes" TEXT;`. Run `pnpm prisma generate`.

- [ ] **Step 4: Implement**

`src/lib/limits.ts`: `export const MAX_LINK_NOTES_LENGTH = 2000;` with a one-line comment.

`src/lib/links.ts`: `LinkNotesError` next to `LinkChangedError`; `normalizeLinkNotes` beside `mapRowToLink`: strip `/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g`, trim, empty → null, over the cap → throw. `mapRowToLink` sets `notes: row.notes ?? null`.

`src/utils/links.ts`: `notes: string | null` on `Link` (doc: "The owner's private note; never public."). `src/lib/serialize-link.ts`: `notes?: string | null` on `LinkLike`, emitted as `notes: link.notes ?? null`.

- [ ] **Step 5: Run the tests, typecheck**

Run: `pnpm vitest run src/lib/links.test.ts src/lib/serialize-link.test.ts src/lib/public-folders.test.ts && pnpm typecheck`
Expected: PASS, no type errors (any `Link` literal in tests that now lacks `notes` gets `notes: null`).

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/limits.ts src/lib/links.ts src/utils/links.ts src/lib/serialize-link.ts src/lib/links.test.ts src/lib/serialize-link.test.ts src/lib/public-folders.test.ts
git commit -m "feat: a private notes column on links"
```

---

### Task 2: Writing a note through the link library

**Files:**
- Modify: `src/lib/links.ts` (`UpdateLinkData`, `updateLinkForUser`, `CreateLinkOptions`, `createLinkForUser`, `insertResolvedLink`, `refreshExistingLink`)
- Test: `src/lib/links.test.ts`

**Interfaces:**
- Consumes: `normalizeLinkNotes`, `LinkNotesError` (Task 1).
- Produces: `UpdateLinkData.notes?: string | null`; `CreateLinkOptions.notes?: string | null`; `createLinkForUser(userId, url, { folderId?, notes? })`.

- [ ] **Step 1: Write the failing tests** (following the file's existing `updateLinkForUser` / `createLinkForUser` tests and prisma mocks)

- `updateLinkForUser(userId, id, { notes: "  a note " })` calls `prisma.link.update` with `data` containing `notes: "a note"`.
- `updateLinkForUser(userId, id, { notes: "" })` writes `notes: null`.
- `updateLinkForUser(userId, id, { notes: "x".repeat(2001) })` rejects with `LinkNotesError` and never calls `prisma.link.update`.
- `updateLinkForUser(userId, id, { url: "https://new.test/", notes: "kept" })` (metadata mocked) writes both the re-scraped fields and `notes: "kept"`.
- `updateLinkForUser(userId, id, { title: "t" })` writes no `notes` key.
- `createLinkForUser(userId, url, { notes: "first" })` on a fresh URL calls `tx.link.create` with `notes: "first"`.
- `createLinkForUser(userId, url, { notes: "second" })` when the URL exists (the `reuse` path) writes no `notes`.

- [ ] **Step 2: Run them**

Run: `pnpm vitest run src/lib/links.test.ts -t "notes"`
Expected: FAIL (`notes` ignored).

- [ ] **Step 3: Implement**

`UpdateLinkData` and `CreateLinkOptions` gain `notes?: string | null` (doc: "Present to set or clear (`null`) the private note; omitted leaves it."). In `updateLinkForUser`, `if (data.notes !== undefined) updateData.notes = normalizeLinkNotes(data.notes)` before the single `prisma.link.update`, in the branch that builds the data for both the url-change and the plain edit. In `createLinkForUser`, normalize `opts?.notes` first (so a bad note fails before any scrape), pass it to `insertResolvedLink(userId, resolved, folderId, notes)`, which adds `...(notes !== null ? { notes } : {})` to `tx.link.create`'s data; the `reuse` branch and `refreshExistingLink` don't touch it.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/links.ts src/lib/links.test.ts
git commit -m "feat: write a link's note on edit and on save"
```

---

### Task 3: The API routes

**Files:**
- Modify: `src/app/api/links/[id]/route.ts`, `src/app/api/links/route.ts`, `src/app/api/v1/links/[id]/route.ts`, `src/app/api/v1/links/route.ts`
- Test: `src/app/api/links/[id]/route.test.ts`, `src/app/api/links/route.test.ts`, `src/app/api/v1/links/[id]/route.test.ts`

**Interfaces:**
- Consumes: `UpdateLinkData.notes`, `CreateLinkOptions.notes`, `LinkNotesError` (Tasks 1–2).
- Produces: `PATCH` bodies accept `notes?: string | null`; `POST` bodies accept `notes?: string | null`; `400 { error: "Keep the note to 2,000 characters or fewer.", code: "INVALID_NOTES" }`; `400 { error: "Invalid notes" }` for a non-string, non-null value.

- [ ] **Step 1: Write the failing tests** (the files' existing mocks of `updateLinkForUser` / `createLinkForUser`)

For each PATCH route: `{ notes: "n" }` alone is accepted and reaches the library as `notes: "n"`; `{ notes: null }` reaches it as `null`; `{ notes: 5 }` → 400 `{ error: "Invalid notes" }`; a `LinkNotesError` thrown by the library → 400 with `code: "INVALID_NOTES"`. For the app and v1 POST: `{ url, notes: "n" }` passes `notes: "n"` in the options; `{ url, notes: 5 }` → 400.

- [ ] **Step 2: Run them**

Run: `pnpm vitest run "src/app/api/links" "src/app/api/v1/links"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Each route: `const hasNotes = body?.notes !== undefined;` then `if (hasNotes && body.notes !== null && typeof body.notes !== "string") return 400 "Invalid notes"`; count `hasNotes` in the "at least one of …" check and extend that message with "notes"; pass `notes` through; `catch (e) { if (e instanceof LinkNotesError) return 400 { error: e.message, code: "INVALID_NOTES" } }` beside the existing `InvalidUploadError` handling. v1 responses go through `addCors` as the rest do. The v1 PATCH's `hasOtherFields` includes `hasNotes`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm vitest run "src/app/api/links" "src/app/api/v1/links" && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/links src/app/api/v1/links
git commit -m "feat: notes on the app and v1 link endpoints"
```

---

### Task 4: MCP

**Files:**
- Modify: `src/lib/mcp.ts` (`save_link` schema, `saveLinkTool`), `src/lib/mcp-resources.ts`, `src/lib/links.ts` (`listLinksForResource`'s select, if it selects fields explicitly)
- Test: `src/lib/mcp.test.ts`, `src/lib/mcp-resources.test.ts`

**Interfaces:**
- Consumes: `createLinkForUser(..., { folderId, notes })`, `LinkNotesError`, `serializeLink` (Tasks 1–2).
- Produces: `saveLinkTool(userId, url, folderId?, notes?)`; `save_link` input `notes?: string` ("A private note to keep with the link, up to 2,000 characters"); resource Markdown with a note line.

- [ ] **Step 1: Write the failing tests**

`src/lib/mcp.test.ts`: `saveLinkTool(userId, url, undefined, "a note")` calls `createLinkForUser` with `{ folderId: undefined, notes: "a note" }` (match the existing call shape); a `LinkNotesError` from it returns an error `ToolResult` whose text is the error message; the `save_link` schema's keys include `notes`.

`src/lib/mcp-resources.test.ts`: a link with `description: "desc"` and `notes: "my note"` renders the description line then `  _my note_`; a 250-character note is cut to 200 characters plus `…`; a note of only whitespace renders no line; `notes: null` renders none.

- [ ] **Step 2: Run them**

Run: `pnpm vitest run src/lib/mcp.test.ts src/lib/mcp-resources.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`save_link`: `notes: z.string().optional().describe(...)`; handler passes it; `saveLinkTool` gains a fourth parameter and catches `LinkNotesError` into the tool's error result like its other validation errors. Resources: after the description block, `const notes = link.notes?.replace(/\s+/g, " ").trim()`, cut with the same `DESCRIPTION_MAX` rule, pushed as `` `  _${cut}_` `` (underscores escaped out of the note text with `\\_`). Make sure the link type the renderer takes (`ResourceLink` or the row type) has `notes`; if `listLinksForResource` uses a `select`, add `notes: true`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/mcp.test.ts src/lib/mcp-resources.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp.ts src/lib/mcp-resources.ts src/lib/mcp.test.ts src/lib/mcp-resources.test.ts src/lib/links.ts
git commit -m "feat: notes on MCP save_link and in the link resources"
```

---

### Task 5: Search over description and notes

**Files:**
- Modify: `src/lib/links.ts` (`linkQueryWhere`: export it; `SearchLinksOptions.query` doc; the `GET /api/links` doc comment in `src/app/api/links/route.ts`)
- Test: `src/lib/links.test.ts`

**Interfaces:**
- Produces: `export function linkQueryWhere(query: string | undefined): { OR: Array<Record<string, { contains: string; mode: "insensitive" }>> } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(linkQueryWhere("  ")).toBeNull();
expect(linkQueryWhere("Bird").OR.map((c) => Object.keys(c)[0])).toEqual(["title", "domain", "url", "description", "notes"]);
expect(linkQueryWhere("Bird").OR[4]).toEqual({ notes: { contains: "Bird", mode: "insensitive" } });
expect(linkQueryWhere("x".repeat(300)).OR[0].title.contains).toHaveLength(200);
```

- [ ] **Step 2: Run them**

Run: `pnpm vitest run src/lib/links.test.ts -t "linkQueryWhere"`
Expected: FAIL (not exported; four fields).

- [ ] **Step 3: Implement**

Export it; the field tuple becomes `["title", "domain", "url", "description", "notes"]`. Update the two doc comments that say "title, domain or URL".

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/links.ts src/lib/links.test.ts src/app/api/links/route.ts
git commit -m "feat: search matches descriptions and notes"
```

---

### Task 6: The Edit dialog, the preview, the marks, the e2e and the docs

**Files:**
- Modify: `src/components/dialog-edit-link.tsx`, `src/components/link-preview.tsx`, `src/components/link-item.tsx:541` (the "Live" mark), `src/components/shared-link-card.tsx` (`LinkCardContent`), `src/components/link-card.tsx:291`
- Modify: `CLAUDE.md`, `public/llms.txt`
- Create: `e2e/link-notes.spec.ts`

**Interfaces:**
- Consumes: `Link.notes`, `PATCH /api/links/[id] { notes }`, search over notes (Tasks 1, 3, 5).
- Produces: `LinkCardContent({ ..., noteMark?: boolean })` (the owner's `LinkCard` passes `noteMark={Boolean(link.notes)}`; the shared card passes nothing); `NoteMark` component in `src/components/note-mark.tsx` (`<span role="img" aria-label="Has a note">` around `<Memo className="size-3.5" aria-hidden />`, `shrink-0 text-muted-foreground`).

- [ ] **Step 1: Write the failing e2e test** `e2e/link-notes.spec.ts` (fixtures: `seed`, `page`, `waitForHydration`; a seeded link `https://example.com/notes` titled "Noted"; folder seeded public with slug `shared`):

- `test("a note is written in the Edit dialog, marked on the row and shown in the preview")`: open `/home`, `waitForHydration(page, 'button[aria-label="Open link menu"]')`, open the menu, click menuitem "Edit", in dialog "Edit link" fill textbox "Notes" with `"Remember the swallow\nSecond line"`, click "Save changes"; expect `page.getByRole("img", { name: "Has a note" })` visible in the row; hover the row (`rows(page).first().hover()` as in `e2e/bulk-selection.spec.ts`); expect `page.locator('[data-slot="hover-card-content"]')` to contain the text "Remember the swallow" (the pattern in `e2e/embeds.spec.ts:340`).
- `test("search finds a link by a word only in its note")`: after the above, type `swallow` in the search field (`getByRole("textbox", { name: /Search your links/ })`); expect the row "Noted" visible; type `zzz-nothing`; expect the text `No links match “zzz-nothing”` (`LinkGroupEmpty`).
- `test("the shared page shows neither the mark nor the note")`: `test.use({ signedIn: false })` in its own describe; seed the link in the public folder with `notes` set through `pool.query('UPDATE "links" SET "notes" = $1 WHERE "id" = $2', …)`; `page.goto(`/@${testUser.username}/shared`)` (the `testUser` fixture, as `e2e/shared-folders.spec.ts` does); expect no `role="img"` named "Has a note"; `expect(await page.content()).not.toContain("swallow")`; `page.request.get(`/@${testUser.username}/shared/feed.xml`)` body does not contain "swallow".

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e e2e/link-notes.spec.ts`
Expected: FAIL (no Notes field, no mark).

- [ ] **Step 3: Implement the dialog**

`dialog-edit-link.tsx`: `defaultValues.notes: link.notes ?? ""`; a `form.Field name="notes"` under Description: `Label` "Notes", a `Textarea` rows 4, and under the label a `Typography size="mini"` hint "Only you see these." linked by `aria-describedby`; the body sends `notes: value.notes.trim() ? value.notes : null`. Dialog description: "Update the title, description and notes for this link." On a 400 whose JSON has `code === "INVALID_NOTES"`, show its `error` under the Notes field (the field's existing error slot) instead of the generic toast.

- [ ] **Step 4: Implement the preview and the marks**

`link-preview.tsx`: `PreviewNote({ text })`, the `PreviewDescription` styles plus `whitespace-pre-line`, rendered after the description in both branches (audio and the rest) when `link.notes`. `note-mark.tsx` as in Interfaces. `link-item.tsx`: `{link.notes ? <NoteMark /> : null}` before the "Live" mark. `LinkCardContent`: `noteMark` prop; in the strip, beside the domain. `link-card.tsx`: pass `noteMark={Boolean(link.notes)}` (media cards don't use the strip, so nothing else).

- [ ] **Step 5: Run the e2e, unit suite, lint and typecheck**

Run: `pnpm test:e2e e2e/link-notes.spec.ts && pnpm vitest run && pnpm lint && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 6: Docs**

CLAUDE.md, under Folders: a "**Notes:**" bullet (the column and cap, `normalizeLinkNotes`, the write paths with `INVALID_NOTES`, `save_link`'s `notes`, the search's five fields, the dialog, preview, `NoteMark` on rows and page cards, and that `PUBLIC_LINK_SELECT`, the feed, the preview image, the demo and the export never carry it). Change the search field's "title/domain/URL" to "title/domain/URL/description/notes" where the Search field bullet says it. `public/llms.txt`: "- Keep a private note on any link; search covers titles, URLs, descriptions and notes."

- [ ] **Step 7: Commit**

```bash
git add src/components e2e/link-notes.spec.ts CLAUDE.md public/llms.txt
git commit -m "feat: notes in the Edit dialog, preview and row marks"
```

---

### Task 7: Full proof

- [ ] **Step 1:** `pnpm vitest run && pnpm lint && pnpm typecheck && pnpm test:e2e e2e/link-notes.spec.ts e2e/shared-folders.spec.ts e2e/omnibox.spec.ts` — all PASS.
- [ ] **Step 2:** `pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` against the local e2e database after `migrate deploy` — no drift.
- [ ] **Step 3:** Tell the user the Notion API and MCP pages need `notes` added by hand (`PATCH`/`POST` link bodies, the link object, `save_link`'s input).
