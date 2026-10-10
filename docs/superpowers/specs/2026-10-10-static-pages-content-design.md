# Static pages content — design

Date: 2026-10-10
Status: approved design, not yet implemented

## Goal

Make the Notion-backed static pages (`/privacy`, `/terms`, `/docs/api`,
`/docs/mcp`, added in #223 with only their title) complete pages that are
live the moment this PR merges: a header with the Purl mark, the page's
title and description, its Notion content, and the landing page's footer.

The footer already links to all four pages (#223); nothing changes there.

## Decisions

- **Ship with empty bodies.** All four Notion rows are `published` but
  their bodies are empty today. Each page shows its title, description and
  "Updated" line until content is written; the webhook refreshes them as it
  lands. No hiding of empty pages.
- **Own renderer over the `NotionBlock` tree** (approach A), not
  `@9gustin/react-notion-render` (the source's library) and not a
  Notion → Markdown → HTML pipeline. The look and behaviour are ported from
  nublson.com's `src/components/content-blocks/`; the code is new, written
  against the typed tree `src/lib/notion.ts` already fetches and caches.
- **No image proxy.** Only **linked** (`external`) Notion images render.
  **Uploaded** (`file`) images are skipped with a server warning: their
  signed URLs expire after ~1h, longer-cached HTML would show broken
  images. Images for these pages are committed under `public/pages/` and
  linked in Notion as `https://purl.live/pages/<name>`. A proxy (the
  source's `/api/notion-image`) can be added later if uploads are wanted.
- **Code highlighting with shiki on the server**, no client highlighter.
- **Heading anchors** on h2–h4; no table of contents.
- **Header: mark only**, linking to `/`. No sign-in or "Open Purl" button.
- **Keep the `/` → `/home` redirect for signed-in users.** The static
  pages already render for everyone (they're "next" routes in
  `src/proxy.ts`); only `/` redirects, and the installed app
  (`manifest.json` `start_url: "/"`) and the MCP OAuth login depend on it.
  A signed-in reader clicking the mark lands on `/home`.
- **"Updated <date>" on all four pages**, from the row's `last_edited_time`.

## 1. Layout and header

`StaticPage` (`src/components/static-page.tsx`) keeps owning the whole page,
like the landing page; a 404 still falls through to the root `not-found`.

```
wrapper-public frame (px-4 md:px-6 lg:px-12, as the landing page)
├─ <header>   BrandMark (pearl + "Purl"), a link to /
├─ <main>
│   ├─ h1            page title (Notion `Name`)
│   ├─ description   (Notion `description`, when set)
│   ├─ "Updated October 3, 2026"
│   └─ <NotionBlocks blocks={page.blocks} />   (nothing when empty)
└─ <LandingFooter />  (unchanged)
```

- **`BrandMark`** (`src/components/brand-mark.tsx`): the hero's pearl
  (`Logo` 24px, decorative) and "Purl" wordmark (`text-lg font-semibold
  tracking-[-0.01em] text-foreground`), extracted from `LandingHero`. The
  hero keeps its `data-landing-block="mark"` wrapper (arrival animation);
  static pages render it without any landing data attributes, so they
  never animate. On static pages it's wrapped in a link to `/` with the
  accessible name "Purl, home", the footer links' focus ring and a 44px
  hit area under `pointer-coarse:`.
- **Alignment:** the header and `<main>` sit on the hero's left edge
  (`md:px-[6%]`) with its top spacing (`pt-12 sm:pt-16 md:pt-20`), so the
  mark doesn't move between `/` and a static page.
- **Title:** `Typography variant="h2" component="h1"`, `mt-8 md:mt-10`
  below the mark (the hero's gap).
- **Description:** the hero sub-headline's style (`Typography`, `text-lg`,
  muted, `text-pretty`), `mt-3.5`, `max-w-[60ch]`.
- **Updated line:** `Typography size="small"`, `mt-4`, containing
  `<time dateTime={lastEditedAt}>`, text "Updated October 3, 2026":
  `Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" })`
  (UTC so static HTML doesn't depend on the server's zone).
- **Body column:** prose blocks `max-w-[68ch]`; code blocks and tables up
  to `max-w-3xl`, scrolling sideways inside themselves, never the page.
  Body starts `mt-10` under the header block.
- **Metadata:** title and description (as today) plus
  `alternates.canonical` (the page's `STATIC_PAGES` path) and Open Graph /
  Twitter title and description. No custom OG image in this PR.

## 2. Block renderers

All in `src/components/notion-blocks/`, server components except the code
block's copy button.

| File | Renders |
|---|---|
| `notion-blocks.tsx` | `NotionBlocks({ blocks, context })`: groups list runs, dispatches on `block.type`, recurses into `children`. Unknown types render nothing (one `console.warn` per type in development). |
| `rich-text.tsx` | `RichText`: bold, italic, strikethrough, underline, inline code, Notion colours/backgrounds, links, mentions (page/link mentions as links, others as plain text), equations as plain text. |
| `text-blocks.tsx` | paragraph, quote, callout (emoji icon or none, `bg-card` panel as in the source), toggle (`<details>`/`<summary>`, no JS). |
| `heading-blocks.tsx` | heading_1/2/3 → h2/h3/h4 (the page title is the only h1), with anchors (section 3). Toggleable headings render their children below them. |
| `list-blocks.tsx` | bulleted and numbered items grouped into `<ul>`/`<ol>`, nested lists, to_do (disabled checkbox + label, struck through when checked). |
| `code-block.tsx`, `copy-code-button.tsx` | section 3. |
| `media-blocks.tsx` | image (`external` only: `<figure>` + `<img loading="lazy" decoding="async">`, caption as alt and `<figcaption>`; `file` → nothing + warning), video (YouTube → `youtube-nocookie.com/embed/<id>` iframe; other → plain link), bookmark / embed / link_preview → a plain link (its caption as text when set, else the URL). |
| `table-block.tsx` | table with optional column header and row header, inside a focusable scroll region (`role="region"`, `aria-label="Table"`, `tabIndex=0`), as in the source. |
| `layout-blocks.tsx` | divider (`ui/separator`), column_list / column (stacked on phones, side by side from `md`), synced_block (its children). |

Not supported (render nothing): child_page, child_database, pdf, file,
audio, breadcrumb, table_of_contents, and link_to_page unless it targets a
`STATIC_PAGES` row (then a link to its path).

### Shared rules

- **Spacing:** the block list is `flex flex-col gap-4`. Headings add top
  space (h2 `mt-8`, h3 `mt-4`, h4 `mt-2`).
- **Text colour:** body text is `text-foreground`. Notion's `default`
  colour inherits. Named colours and `_background` colours use the
  source's palette (`NOTION_COLOR_CLASSES`), each checked for ≥4.5:1
  contrast against the page background in both themes (adjust shades where
  the source's fail).
- **Links** (one helper, `classifyNotionLink`, in `src/lib/notion-links.ts`):
  - `https://www.notion.so/…<32-hex id>` (or `notion.so`, dashed or not)
    whose id is a `STATIC_PAGES` row → that page's path, same tab. Needs
    the published pages' ids: `StaticPage` passes a `pageIdToPath` map
    (from `getPublishedPages()`, already cached) through `context`.
  - Root-relative (`/…`), hash (`#…`), and `https://purl.live/…` → same tab.
  - Other `http(s):` → new tab, `rel="noopener noreferrer"`.
  - `mailto:` → same tab.
  - Anything else (`javascript:`, `data:`, malformed) → the text without a
    link.
  - Link style: `underline underline-offset-2`, `hover:text-foreground`,
    the app's focus ring.
- **Typography:** `p`, `li`, `h*`, `a`, `span` go through `Typography`
  (project convention); raw tags only for `ul`, `ol`, `table` parts,
  `figure`, `figcaption`, `details`, `summary`, `pre`, `code`,
  `blockquote`, `mark`, `strong`, `em`, `s`, `u`, `img`, `iframe`.
- **Keys:** block ids (Notion's) everywhere; rich-text parts by index.

## 3. Code blocks and heading anchors

### Code blocks

- **`src/lib/code-highlight.ts`** (`server-only`): shiki's fine-grained
  core (`createHighlighterCore` from `shiki/core`) with the JavaScript
  regex engine (`shiki/engine/javascript`), no WASM. One highlighter,
  created lazily and reused.
- **Languages:** `bash` (covers `shell`/`sh`/`zsh`), `json`, `typescript`,
  `javascript`, `tsx`, `http`, `python`, `yaml`, `markdown`, `diff`,
  `toml`. `normalizeLanguage` (ported from the source, aliases extended
  for Notion's labels: "Plain Text", "Shell", "JavaScript", "TypeScript",
  …) maps Notion's label; unknown or plain text → no highlighting, same
  frame.
- **Themes:** `github-light` / `github-dark`, dual, `defaultColor: false`:
  every token carries `--shiki-light` and `--shiki-dark`. `globals.css`
  sets `color: var(--shiki-light)` by default and `var(--shiki-dark)`
  under `.dark`. The block's background is ours (`bg-muted`, `border`,
  `rounded-lg`), never the theme's.
- **Rendering:** `CodeBlock` is an async server component.
  `codeToHast` → React via `hast-util-to-jsx-runtime` (a small direct
  dependency next to `shiki`; no `dangerouslySetInnerHTML`, text is
  escaped). Structure:
  `<figure>` → header row (language label, small and muted; `CopyCodeButton`
  on the right) → `<pre>` (`overflow-x-auto`, no wrapping, `tabIndex=0`,
  `role="region"`, `aria-label="Code, <language>"`) → optional
  `<figcaption>` from the Notion caption.
- **`CopyCodeButton`** (client): copies the raw code with
  `src/lib/clipboard.ts`; the label goes "Copy" → "Copied" for 2s, with a
  polite live region; no toast. Icons from `reicon-react`.
- **Failure:** if highlighting throws, the block renders plain
  `<pre><code>` in the same frame.

### Heading anchors

- `src/lib/heading-slugs.ts`: `slugify(text)` (NFKD, accents stripped,
  lowercase, runs of non-alphanumerics → `-`, trimmed; empty → `section`)
  and `createSlugger()` returning a function that de-duplicates
  (`-2`, `-3`, … in page order). One slugger per page render, created in
  `NotionBlocks`' root and passed through `context`.
- Headings get `id` and `scroll-mt-8`. A `#` link after the text
  (`aria-label="Link to section: <heading>"`), shown on heading hover or
  link focus, always shown under `pointer-coarse:`. It's a plain
  `href="#slug"` link (no JS).

## 4. Error handling, testing, going live

### Error handling

Notion reads behave as since #223: a failed read is a 404 at build time
and throws at runtime (ISR keeps the last good page). Within a page, one
block never fails the page:

- unknown type → nothing;
- code that can't be highlighted → plain text;
- uploaded image → nothing, `console.warn("Static page \"<slug>\": skipped
  uploaded image <block id>; link images instead")`;
- rich text with a missing or rejected link → its plain text;
- no description → no description line, none in metadata.

### Testing

- **Unit (Vitest, node):** `slugify` / slugger de-duplication;
  `classifyNotionLink` (each case above); `normalizeLanguage`; list
  grouping (bulleted runs, numbered runs, mixed, nested); YouTube URL →
  nocookie embed (watch, youtu.be, shorts, non-YouTube); "Updated" date
  formatting in UTC.
- **Render (Vitest, node):** `NotionBlocks` prerendered to HTML with
  `react-dom/static` `prerender` (handles the async code block) from
  fixture blocks shaped like the Notion API: every supported type,
  an unsupported type renders nothing, an uploaded image is skipped, a
  `javascript:` link renders as text, a Notion page link becomes
  `/privacy`, shiki output carries both theme variables.
- **e2e (`e2e/static-pages.spec.ts`, Playwright):** signed out: each
  footer link opens its page with the mark (link to `/`), one h1, the
  "Updated" line and the footer; signed in: the page renders (no
  redirect), and clicking the mark lands on `/home`. It runs against the
  live Notion rows, so it asserts structure, not copy, and skips with a
  clear message when `NOTION_ACCESS_TOKEN` isn't set.
- **Docs:** CLAUDE.md's "Static pages" section: the layout, renderers and
  supported blocks, linked images only (`public/pages/`), shiki, anchors.
  The landing page section: `BrandMark`.

### Going live on merge

Checked during implementation, not assumed:

1. **Vercel env:** `NOTION_ACCESS_TOKEN`, `NOTION_PAGES_DATA_SOURCE_ID` and
   `NOTION_WEBHOOK_SECRET` exist for Production and Preview (names only,
   never values). The pages are `force-static`: without them at build
   time they're prerendered as 404 until the hourly revalidation.
2. **Webhook:** the Notion subscription targets production's
   `/api/notion/revalidate`; an edit refreshes the page.
3. **After the dev deploy:** all four pages on `dev.purl.live`, signed in
   and out, light and dark, phone width.

## Out of scope

- An image proxy for uploaded Notion images.
- A table of contents, a custom OG image, Markdown / `llms.txt` exports.
- Making the landing page viewable by signed-in users.
- Writing the pages' content in Notion.
