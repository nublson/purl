# Link notes and search — Design

**Date:** 2026-10-31
**Builds on:** the product analysis of 2026-10-31 (export shipped as PR #261, the share target as PR #262; retrieval was the next gap).

## Goal

A link can carry a **note**: the owner's own words, private, searchable. Search finds links by what the owner typed about them and by the page's description, not only by title, domain and URL. Purl stays a shelf without an AI layer: a note is one text field, found by substring.

## Decisions

Settled with the user during brainstorming:

- **A note is its own private field**, not the description. The description is the page's scraped blurb: it's replaced when a URL changes, filled by the enrich cron, and shown to everyone on shared folders, feeds and preview images. A note is never scraped, never replaced, never public.
- **Edited in the Edit dialog, shown in the hover preview, marked on rows and cards.** Nothing inline on rows (they stay uniform), nothing on the shared page.
- **Search is the existing substring clause, widened** to description and notes. Postgres full-text search (stemming, ranking) was rejected: the list is newest-first by design, the search leans on substrings like a domain fragment, and the 1,000-link cap keeps the per-user scan cheap.
- **MCP gets `notes` on `save_link` and in reads**; no link-update tool is added (MCP has none today; that's its own decision).

Out of scope: inline editing, Markdown or links inside notes, notes on folders, an MCP `update_link`, notes in import files (no format has them) and in the bookmarks export (its `DD` is the description and the file is for other tools), notes in the landing demo.

## 1. Data

- `Link.notes String?` (Postgres `TEXT`), an additive migration `…_link_notes`. `null` means no note.
- `MAX_LINK_NOTES_LENGTH = 2000` in `src/lib/limits.ts`.
- `normalizeLinkNotes(notes: string | null | undefined): string | null` in `src/lib/links.ts`, mirroring `normalizeFolderDescription`: trims, empty → `null`, over the cap → throws `LinkNotesError` (message "Keep the note to 2,000 characters or fewer."). Whitespace inside is kept (line breaks are the user's).
- `Link` (`src/utils/links.ts`) gains `notes: string | null`; `mapRowToLink` and `serializeLink` carry it, so every owner-facing read has it: `GET /api/links` (pages), `GET /api/links/[id]`, `GET /api/links/search`, v1 `GET /api/v1/links` and `/api/v1/links/[id]`, MCP `list_saved_items`.
- `PUBLIC_LINK_SELECT` (`src/lib/public-folders.ts`) does **not** select it; `PublicLink`, the Atom feed (`buildAtomFeed`) and the folder's `opengraph-image` therefore never see it. The landing demo reads the `@purl` account through the public select, so it has no notes either.

## 2. Writing a note

- `UpdateLinkData` gains `notes?: string | null`. `updateLinkForUser` normalizes it (`normalizeLinkNotes`) and writes it in the same single `prisma.link.update` as the other fields. A `url` change re-scrapes title/description/favicon exactly as today and leaves `notes` alone; `resolveLinkFromUrl`, the enrich cron and the save path never write `notes`, except `createLinkForUser` when given one (below).
- App `PATCH /api/links/[id]` and v1 `PATCH /api/v1/links/[id]` accept `{ notes?: string | null }` with the existing fields (`null` clears). It counts as a field for the "at least one of…" check. `LinkNotesError` → `400 { error, code: "INVALID_NOTES" }`. Duplicate-URL refresh on save keeps the existing note.
- `createLinkForUser` takes an optional `notes` (normalized, same error); `POST /api/links` and v1 `POST /api/v1/links` accept it; `POST /api/v1/links/save` (the save-only token) does not (the extension and the portfolio send a URL alone).
- MCP `save_link` takes `notes?: string` ("A private note to keep with the link, up to 2,000 characters"); over the cap is the tool's error text. `list_saved_items` returns `notes` through `serializeLink`. The `purl://` resources' Markdown (`src/lib/mcp-resources.ts`) adds a note after the description as its own line, italic, cut to 200 characters like the description (they're the owner's reads: the MCP token is the owner's).

## 3. Search

- `linkQueryWhere` (`src/lib/links.ts`) builds its `OR` over `title`, `domain`, `url`, `description`, `notes` (case-insensitive `contains`), so Home, folder pages, "Search all links", the folder page's Add section and the Add links picker (`searchLinksForUser` reuses it) all match notes and descriptions. `q` on `GET /api/links` and `/api/links/search` keeps its length cap.
- The search field's placeholder and accessible label keep their wording ("Search your links…"). No new UI for search.

## 4. Showing a note

- **Edit dialog** (`src/components/dialog-edit-link.tsx`): a "Notes" `Textarea` (rows 4) under Description, with a hint under the label, "Only you see these." The form sends `notes: value.notes.trim() ? value.notes : null`, like the description. Dialog description becomes "Update the title, description and notes for this link." A note over the cap shows the server's message under the field (the dialog's existing error path).
- **Hover preview** (`LinkPreviewBody`, `src/components/link-preview.tsx`): the note under the description, same clamp (`PreviewDescription`'s three lines), with `whitespace-pre-line` so the owner's line breaks hold; above the folder line. Owner's rows only (the shared row never has one to show).
- **Row and card mark:** a `Memo` icon (Reicon) at 14px, `text-muted-foreground`, in the row's title line after the title and before the "Live" mark, `shrink-0`; on page cards, in the strip beside the domain (`LinkCardContent` in `shared-link-card.tsx`, owner's cards only: the shared card never has a note). Media cards (image, video, audio: no strip) show no mark; their preview, menu Edit and dialog still carry the note. `aria-label="Has a note"` on the icon's `<span>`; the note's text is not read on the row (the preview and the dialog have it). No mark in the landing demo (no notes there), none on the shared page.
- The row's `aria-describedby` chain (description, folder) is unchanged: a note is not the row's description.

## 5. Errors and limits

- `INVALID_NOTES` (400) for a note over 2,000 characters on every write path; MCP words it as the tool's error.
- Nothing else changes: the link cap, storage cap and rate limits are untouched (a note is part of a link write).

## 6. Tests

Unit (vitest):
- `normalizeLinkNotes`: trim, empty → null, cap, inner whitespace kept.
- `linkQueryWhere`: the five-field `OR`, blank → null, the length cap.
- `serializeLink` carries `notes`; `PUBLIC_LINK_SELECT` has no `notes` key (pins privacy); `buildAtomFeed` output has no note text for a link with one.
- MCP `save_link` with and without `notes`; `list_saved_items` returns it; the resources' Markdown shows the note line.
- Route tests where they exist for `PATCH /api/links/[id]` and v1: `notes` accepted, `null` clears, over the cap → `INVALID_NOTES`.

e2e (`e2e/link-notes.spec.ts`, local database, no network):
- Seed a link; open its row menu → Edit; type a note; save: the row shows the "Has a note" mark and the hover preview shows the note.
- Search a word that appears only in the note: the link is listed; a word only in the description is found too.
- Make the folder public, open `/@username/slug` signed out: the row shows no mark and the page's HTML contains no note text; the feed has none.

## 7. Docs

- CLAUDE.md: a "Notes" bullet under Folders (data, write paths, search, where it shows, privacy), the search field's description updated to "title/domain/URL/description/notes", MCP `save_link` mentions `notes`.
- `public/llms.txt`: "Keep a private note on any link; search covers titles, URLs, descriptions and notes."
- The API and MCP Notion pages (`/docs/api`, `/docs/mcp`) are the owner's to update in Notion; the plan lists the fields to add.

## Files

| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, `prisma/migrations/<ts>_link_notes/migration.sql` |
| Limits, model | `src/lib/limits.ts`, `src/utils/links.ts`, `src/lib/links.ts` (`normalizeLinkNotes`, `LinkNotesError`, `UpdateLinkData`, `createLinkForUser`, `linkQueryWhere`, `mapRowToLink`), `src/lib/serialize-link.ts` |
| Routes | `src/app/api/links/route.ts`, `src/app/api/links/[id]/route.ts`, `src/app/api/v1/links/route.ts`, `src/app/api/v1/links/[id]/route.ts` |
| MCP | `src/lib/mcp.ts`, `src/lib/mcp-resources.ts` |
| UI | `src/components/dialog-edit-link.tsx`, `src/components/link-preview.tsx`, `src/components/link-item.tsx`, `src/components/shared-link-card.tsx` (`LinkCardContent`, the page card's strip, with an owner-only flag) |
| Tests | the unit files beside each module, `e2e/link-notes.spec.ts` |
| Docs | `CLAUDE.md`, `public/llms.txt` |
