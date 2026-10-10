# Static Pages Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/privacy`, `/terms`, `/docs/api`, `/docs/mcp` become complete pages (Purl mark, title, description, "Updated" line, Notion content, landing footer), live on merge.

**Architecture:** Pure helpers (link classification, slugs, languages, YouTube, dates) are unit-tested first. `src/components/notion-blocks/` renders the `NotionBlock` tree `src/lib/notion.ts` already fetches, as server components, through one dispatcher with a render `context`. Code blocks use shiki (fine-grained core, JS regex engine) on the server, converted to React with `hast-util-to-jsx-runtime`. `StaticPage` composes `BrandMark`, the header block, `NotionBlocks` and `LandingFooter`.

**Tech Stack:** Next.js 16 App Router (server components, `force-static`), `@notionhq/client` v5 types, shiki 4, `hast-util-to-jsx-runtime` 2, Tailwind v4, Vitest 4 (node; render tests via `react-dom/static` `prerender`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-static-pages-content-design.md`

## Global Constraints

- No image proxy. Only `image.type === "external"` renders; `file` images render nothing and warn: `Static page "<slug>": skipped uploaded image <block id>; link images instead`.
- Notion heading_1/2/3 → `h2`/`h3`/`h4`. The page title is the only `h1`.
- Render `p`, `li`, `h*`, `a`, `span` through `Typography` (`@/components/typography`); raw tags only for elements it doesn't cover.
- Icons: named imports from `reicon-react` (`Copy3`, `Check` are already used in the app). No `lucide-react`.
- Links: Notion page URL whose id is a published `STATIC_PAGES` row → its path; `/…`, `#…`, `*.purl.live` / `purl.live` → same tab (purl URLs become path + search + hash); other `http(s):` → `target="_blank" rel="noopener noreferrer"`; `mailto:` → same tab; anything else → text, no link.
- YouTube embeds use `https://www.youtube-nocookie.com/embed/<id>`.
- "Updated" copy: `Updated October 3, 2026` — `Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" })`, inside `<time dateTime={iso}>`.
- shiki: `shiki/core` + `shiki/engine/javascript`, themes `github-light` / `github-dark`, `defaultColor: false`, languages `bash json typescript javascript tsx http python yaml markdown diff toml`. Our background (`bg-muted border rounded-lg`), never the theme's.
- Copy button copy: "Copy" → "Copied" for 2000ms; accessible name "Copy code" / "Code copied"; no toast.
- Heading anchor accessible name: `Link to section: <heading text>`.
- Mark link accessible name: `Purl, home`.
- No new dependencies besides `shiki` and `hast-util-to-jsx-runtime`.
- PRs only when the user asks (repo memory); this plan ends at a verified branch.
- The footer's "@nublson" link goes to `process.env.NUBLSON_URL` (set in Vercel), falling back to `https://github.com/nublson` when unset or not an `https:` URL.

## Review Focus

1. A Notion link to a page that is *not* a published static page (a draft row, or any other workspace page) → must stay a plain external notion.so link, never a broken `/undefined` (Task 1 test `leaves notion links to unknown pages external`).
2. Two headings with the same text (e.g. two "Request" sections on the API page) → distinct, stable ids `request`, `request-2` (Task 2 slugger test; Task 3 render test `dedupes heading ids across the page`).
3. A code block whose language Notion labels oddly ("Plain Text", "Shell", "JSON", or one shiki doesn't load, like "Swift") → renders as code in the same frame, never throws (Task 6 tests `falls back to plain text for unknown languages`, `renders plain text when highlighting throws`).
4. An empty page body (today's reality) → header, "Updated" line and footer only, no empty wrappers that add stray spacing (Task 7 test `renders no body container for an empty page`).
5. Rich text with HTML-looking or `javascript:` content (likely in API docs: `<url>`, `<script>`) → escaped text, no live link (Task 3 test `escapes HTML-looking text and drops javascript: links`).

---

### Task 1: Link classification

**Files:**
- Create: `src/lib/notion-links.ts`
- Test: `src/lib/notion-links.test.ts`

**Interfaces:**
- Produces:
  - `type NotionLink = { href: string; external: boolean }`
  - `notionPageIdFromUrl(url: string): string | null` — 32 lowercase hex chars (dashes removed) from a `notion.so` / `www.notion.so` / `*.notion.site` URL's last path segment; null otherwise.
  - `buildPageIdToPath(pages: readonly { id: string; slug: string }[]): Map<string, string>` — keys: Notion id without dashes, lowercase; only slugs present in `STATIC_PAGES`; values: their `path`.
  - `classifyNotionLink(href: string | null | undefined, pageIdToPath: ReadonlyMap<string, string>): NotionLink | null`

- [ ] **Step 1: Write the failing tests** (`describe("classifyNotionLink")` etc.). Use `const map = buildPageIdToPath([{ id: "244b1726-8ab3-83c3-9388-87a7a5748b73", slug: "privacy" }, { id: "11111111-2222-3333-4444-555555555555", slug: "not-a-static-page" }])`:
  - `buildPageIdToPath` → `map.get("244b17268ab383c3938887a7a5748b73")` is `"/privacy"`, `map.size === 1`.
  - `notionPageIdFromUrl("https://www.notion.so/Privacy-244b17268ab383c3938887a7a5748b73?pvs=4")` → `"244b17268ab383c3938887a7a5748b73"`; `"https://nublson.notion.site/244b1726-8ab3-83c3-9388-87a7a5748b73"` → same; `"https://example.com/244b17268ab383c3938887a7a5748b73"` → `null`.
  - `classifyNotionLink("https://www.notion.so/Privacy-244b17268ab383c3938887a7a5748b73", map)` → `{ href: "/privacy", external: false }`.
  - test `leaves notion links to unknown pages external`: `"https://www.notion.so/Draft-99999999999999999999999999999999"` → `{ href: <same>, external: true }`.
  - `"/terms"` → `{ href: "/terms", external: false }`; `"#request"` → internal; `"https://purl.live/docs/api#auth"` → `{ href: "/docs/api#auth", external: false }`; `"https://dev.purl.live/privacy"` → `{ href: "/privacy", external: false }`.
  - `"https://github.com/nublson/purl"` → external true; `"mailto:hello@purl.live"` → `{ href: "mailto:hello@purl.live", external: false }`.
  - `"javascript:alert(1)"`, `"data:text/html,x"`, `"//evil.example"`, `""`, `undefined` → `null`.
- [ ] **Step 2:** `pnpm vitest run src/lib/notion-links.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** the three functions in `src/lib/notion-links.ts` (plain module, no `server-only`; imports `STATIC_PAGES`). Parse with `new URL`; reject protocol-relative `//`.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5: Commit** `git add src/lib/notion-links.ts src/lib/notion-links.test.ts && git commit -m "Notion links: classify internal, external and static page links"`

### Task 2: Small helpers — slugs, code languages, YouTube embeds, Updated date

**Files:**
- Create: `src/lib/heading-slugs.ts`, `src/lib/code-languages.ts`
- Modify: `src/utils/youtube.ts` (add export), `src/utils/formatter.ts` (add export)
- Test: `src/lib/heading-slugs.test.ts`, `src/lib/code-languages.test.ts`, `src/utils/youtube.test.ts`, `src/utils/formatter.test.ts`

**Interfaces:**
- Produces:
  - `slugify(text: string): string` — NFKD, strip combining marks, lowercase, runs of non `[a-z0-9]` → `-`, trim `-`; empty → `"section"`.
  - `createSlugger(): (text: string) => string` — first use `slug`, repeats `slug-2`, `slug-3`…
  - `HIGHLIGHT_LANGUAGES = ["bash","json","typescript","javascript","tsx","http","python","yaml","markdown","diff","toml"] as const`; `type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number]`
  - `normalizeLanguage(label: string | null | undefined): HighlightLanguage | null` — null means plain text.
  - `codeLanguageLabel(label: string | null | undefined): string` — display label: Notion's label as given, `"Plain text"` when empty/plain.
  - `getYouTubeEmbedUrl(url: string): string | null` (in `src/utils/youtube.ts`)
  - `formatUpdatedDate(iso: string): string` (in `src/utils/formatter.ts`)

- [ ] **Step 1: Write the failing tests:**
  - `slugify("Save a link")` → `"save-a-link"`; `slugify("Créer & partager!")` → `"creer-partager"`; `slugify("  ")` → `"section"`.
  - slugger: `["Request","Response","Request","request"]` → `["request","response","request-2","request-3"]`.
  - `normalizeLanguage`: `"Shell"`, `"sh"`, `"zsh"`, `"bash"` → `"bash"`; `"JavaScript"`/`"js"` → `"javascript"`; `"TypeScript"`/`"ts"` → `"typescript"`; `"JSON"` → `"json"`; `"yml"` → `"yaml"`; `"md"` → `"markdown"`; `"py"` → `"python"`; `"Plain Text"`, `""`, `null` → `null`; `"Swift"` → `null`.
  - `codeLanguageLabel("Plain Text")` → `"Plain text"`; `codeLanguageLabel("JSON")` → `"JSON"`; `codeLanguageLabel(null)` → `"Plain text"`.
  - `getYouTubeEmbedUrl`: `"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"`, `"https://youtu.be/dQw4w9WgXcQ"`, `"https://youtube.com/shorts/dQw4w9WgXcQ"`, `"https://www.youtube.com/embed/dQw4w9WgXcQ"` → `"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"`; `"https://vimeo.com/1"`, `"https://youtube.com/watch?v=<script>"` → `null` (id must match `/^[A-Za-z0-9_-]{11}$/`).
  - `formatUpdatedDate("2026-10-03T23:30:00.000Z")` → `"October 3, 2026"` (UTC, not the next day).
- [ ] **Step 2:** `pnpm vitest run src/lib/heading-slugs.test.ts src/lib/code-languages.test.ts src/utils/youtube.test.ts src/utils/formatter.test.ts` → new tests FAIL.
- [ ] **Step 3: Implement** each function. Language aliases: start from nublson.com's `normalizeLanguage` (`src/components/content-blocks/utils/normalize-language.ts`), keyed by lowercased trimmed label, plus `shell`, `zsh`, `sh` → `bash`; return null for anything not in `HIGHLIGHT_LANGUAGES`. YouTube: reuse `parseHttpUrl` from `./url`.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5: Commit** `"Helpers for static pages: heading slugs, code languages, YouTube embeds, Updated date"`

### Task 3: Render harness, rich text, the dispatcher, text/heading/layout blocks

**Files:**
- Modify: `vitest.config.ts` (`include: ["src/**/*.test.ts", "src/**/*.test.tsx"]`)
- Create: `src/components/notion-blocks/types.ts`, `notion-blocks.tsx`, `rich-text.tsx`, `text-blocks.tsx`, `heading-blocks.tsx`, `layout-blocks.tsx`, `index.ts`
- Create: `src/components/notion-blocks/test-utils.ts` (fixture builders + `renderToHtml`)
- Test: `src/components/notion-blocks/notion-blocks.test.tsx`

**Interfaces:**
- Consumes: Task 1 `classifyNotionLink`; Task 2 `createSlugger`, `slugify`.
- Produces:
  - `type NotionRenderContext = { pageSlug: string; pageIdToPath: ReadonlyMap<string, string>; slug: (text: string) => string }`
  - `NotionBlocks({ blocks, context }: { blocks: NotionBlock[]; context: NotionRenderContext }): ReactNode` — exported from `@/components/notion-blocks`; renders `null` for `blocks.length === 0`, else `<div className="flex flex-col gap-4">…</div>` at the top level. Children (nested) render through an internal `BlockList` that reuses the same `context` (one slugger per page).
  - `createRenderContext(pageSlug: string, pageIdToPath: ReadonlyMap<string, string>): NotionRenderContext` (builds the slugger).
  - `RichText({ text, context }: { text: RichTextItemResponse[]; context: NotionRenderContext })`
  - `renderBlock(block: NotionBlock, context): ReactNode` — the switch other tasks add cases to.
  - test-utils: `block(type, data, extra?)`, `richText(text, opts?: { href?, annotations? })`, `renderToHtml(node): Promise<string>` (via `prerender` from `react-dom/static`).

- [ ] **Step 1: Write the failing render tests** (`notion-blocks.test.tsx`), each asserting on the HTML string:
  - paragraph → contains `<p` with the text and class `text-foreground`.
  - rich text: bold → `<strong>`, italic → `<em>`, strikethrough → `<s>`, underline → `<u>`, code → `<code`, color `"red"` → class `text-red-700`, `"blue_background"` → `<mark` with `bg-blue-100`.
  - links: `https://example.com` → `target="_blank"` + `rel="noopener noreferrer"`; a notion.so URL of the context's privacy id → `href="/privacy"` without `target`.
  - test `escapes HTML-looking text and drops javascript: links`: text `<script>alert(1)</script>` → `&lt;script&gt;`; link `javascript:alert(1)` with text "click" → contains `click`, no `href="javascript`.
  - heading_1 "Save a link" → `<h2 id="save-a-link"`, and an `<a href="#save-a-link" aria-label="Link to section: Save a link"`; heading_2 → `<h3`; heading_3 → `<h4`.
  - test `dedupes heading ids across the page`: two heading_2 "Request", one nested inside a toggle → ids `request` and `request-2`.
  - toggleable heading with children → children rendered after the heading.
  - quote → `<blockquote`; callout with emoji `💡` → contains `💡` and `bg-card`; toggle → `<details` + `<summary` + children.
  - divider → `data-slot="separator"`; column_list with two columns → both columns' text, wrapper class contains `md:grid-cols-2`… (implementer: `grid gap-4 md:grid-flow-col md:auto-cols-fr`, assert `md:grid-flow-col`); synced_block → its children.
  - unsupported type (`child_page`) → empty string for that block; `NotionBlocks` with `[]` → `""`.
- [ ] **Step 2:** `pnpm vitest run src/components/notion-blocks` → FAIL.
- [ ] **Step 3: Implement.**
  - `NOTION_COLOR_CLASSES` (in `rich-text.tsx`): `default` → none (inherit); text: `gray` `text-gray-600 dark:text-gray-400`, `brown` `text-amber-800 dark:text-amber-400`, and `orange|yellow|green|blue|purple|pink|red` → `text-<c>-700 dark:text-<c>-400`; backgrounds `<c>_background` → `bg-<c>-100 dark:bg-<c>-900/60` (gray: `bg-gray-100 dark:bg-gray-800`, brown: `bg-amber-100 dark:bg-amber-900/60`) on a `<mark className="rounded-sm px-0.5 text-inherit">`. Write class strings out in full (Tailwind scans literals).
  - Inline code: `<code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.875em]">`.
  - Link style: `underline underline-offset-2 hover:text-foreground` + the footer's focus ring (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm`), via `Typography component="a"`.
  - Mentions/equations: render `plain_text`, linked when `href` classifies.
  - Headings: h2 `Typography variant="h3" component="h2" className="mt-8 scroll-mt-8"`, h3 `variant="h4" component="h3" className="mt-4 scroll-mt-8"`, h4 `component="h4" className="mt-2 scroll-mt-8 font-semibold text-foreground"` (size regular). Anchor `#` link after the text: `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100`, muted. Slug from the heading's joined `plain_text`.
  - Paragraph `Typography className="max-w-[68ch] text-foreground"`; empty paragraph (no rich text) renders nothing.
  - Callout: `flex gap-3 rounded-lg bg-card p-4`, emoji icon only (other icon types: none), children after the text.
  - Toggle: `<details className="group">` with `<summary className="cursor-pointer text-foreground">`, children in a `pl-5 mt-2 flex flex-col gap-4` div.
  - Divider: `Separator` from `@/components/ui/separator`.
- [ ] **Step 4:** `pnpm vitest run src/components/notion-blocks` → PASS; `pnpm test` → all PASS.
- [ ] **Step 5: Commit** `"Notion blocks: rich text, headings with anchors, text and layout blocks"`

### Task 4: Lists and to-dos

**Files:**
- Create: `src/components/notion-blocks/group-blocks.ts`, `src/components/notion-blocks/list-blocks.tsx`
- Modify: `src/components/notion-blocks/notion-blocks.tsx` (use grouping in `BlockList`)
- Test: `src/components/notion-blocks/group-blocks.test.ts`, add cases to `notion-blocks.test.tsx`

**Interfaces:**
- Consumes: Task 3 `renderBlock`, `RichText`, `NotionRenderContext`.
- Produces:
  - `type BlockGroup = { kind: "block"; block: NotionBlock } | { kind: "bulleted" | "numbered" | "todo"; items: NotionBlock[] }`
  - `groupBlocks(blocks: NotionBlock[]): BlockGroup[]` — consecutive `bulleted_list_item` / `numbered_list_item` / `to_do` runs become one group; any other block ends a run.

- [ ] **Step 1: Write the failing tests.** `groupBlocks`: `[b, b, p, n, n, b]` → kinds `["bulleted","block","numbered","bulleted"]` with item counts `[2, -, 2, 1]`; `[todo, todo]` → one `"todo"` group; `[]` → `[]`. Render: two bulleted items → one `<ul` with two `<li`; numbered → `<ol`; a bulleted item with bulleted children → nested `<ul` inside the `<li`; to_do checked → `<input type="checkbox" disabled="" checked=""` and the label wrapped in `<s`; unchecked → no `checked`.
- [ ] **Step 2:** `pnpm vitest run src/components/notion-blocks` → FAIL.
- [ ] **Step 3: Implement.** `<ul className="flex max-w-[68ch] list-disc flex-col gap-2 pl-6">` / `list-decimal`; to_do list `list-none pl-0`; each item is a `<label className="flex items-start gap-2">` holding a real disabled checkbox and its text (not `aria-hidden`: the checked state is content). Item children render inside the `<li>` after the text via `BlockList` (so nested lists group too).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `"Notion blocks: bulleted, numbered and to-do lists"`

### Task 5: Media, links and tables

**Files:**
- Create: `src/components/notion-blocks/media-blocks.tsx`, `src/components/notion-blocks/table-block.tsx`
- Modify: `src/components/notion-blocks/notion-blocks.tsx` (cases)
- Test: add cases to `notion-blocks.test.tsx`

**Interfaces:**
- Consumes: Task 1 `classifyNotionLink`; Task 2 `getYouTubeEmbedUrl`; Task 3 context/RichText.
- Produces: renderers for `image`, `video`, `bookmark`, `embed`, `link_preview`, `link_to_page`, `table` (+ `table_row` children).

- [ ] **Step 1: Write the failing tests:**
  - external image with caption "Claude settings" → `<figure`, `<img` with `src` = the URL, `alt="Claude settings"`, `loading="lazy"`, `<figcaption` with the caption; no caption → `alt=""`.
  - uploaded (`file`) image → nothing, and `console.warn` called once with `Static page "privacy": skipped uploaded image <id>; link images instead` (spy with `vi.spyOn(console, "warn")`).
  - video `external` YouTube URL → `<iframe` with `src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"`, a `title`, `allowFullScreen`; video non-YouTube → a link to the URL; video `file` → nothing.
  - bookmark with caption → link with the caption text; without → link text = URL; `javascript:` bookmark → nothing.
  - link_to_page whose `page_id` is the privacy id → link to `/privacy` with text from the page's title (use `"Privacy"` from `STATIC_PAGES` label); unknown page → nothing.
  - table with `has_column_header: true` and 2 rows → `<thead` with `<th`, `<tbody` with one row; `has_row_header: true` → first cell of each body row is `<th scope="row"`; wrapper `role="region"` `aria-label="Table"` `tabindex="0"`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implement.** Image: `<img className="w-full rounded-lg border border-border">`; figure `max-w-3xl`. Iframe: `aspect-video w-full rounded-lg`, `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"`, `referrerPolicy="strict-origin-when-cross-origin"`, title `"YouTube video"` or the caption. Table: source's look (`border px-4 py-2 text-left`, header `bg-card font-semibold text-foreground`), cells via `RichText`, wrapper `max-w-3xl overflow-x-auto`. link_to_page: map `page_id` (dashes removed) through `context.pageIdToPath`, label from `STATIC_PAGES` by path.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `"Notion blocks: linked images, YouTube embeds, bookmarks and tables"`

### Task 6: Code blocks with shiki and a copy button

**Files:**
- Modify: `package.json` / lockfile (`pnpm add shiki hast-util-to-jsx-runtime`)
- Create: `src/lib/code-highlight.ts` (`server-only`), `src/components/notion-blocks/code-block.tsx`, `src/components/notion-blocks/copy-code-button.tsx` (`"use client"`)
- Modify: `src/components/notion-blocks/notion-blocks.tsx` (case `code`), `src/app/globals.css` (shiki colours)
- Test: `src/lib/code-highlight.test.ts`, add cases to `notion-blocks.test.tsx`

**Interfaces:**
- Consumes: Task 2 `normalizeLanguage`, `codeLanguageLabel`, `HIGHLIGHT_LANGUAGES`.
- Produces:
  - `highlightCode(code: string, language: HighlightLanguage): Promise<Element>` — the hast `<code>` element from `codeToHast(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false })`'s `<pre>`; throws on failure.
  - `CodeBlock({ block, context })` (async server component); `CopyCodeButton({ code }: { code: string })`.

- [ ] **Step 1: Write the failing tests.** `highlightCode('{"a":1}', "json")` → a hast element with `tagName === "code"` whose serialized children contain `--shiki-light:` and `--shiki-dark:`. Render: code block language `"JSON"` → `<figure`, label `JSON`, `<pre` with `tabindex="0"` `role="region"` `aria-label="Code, JSON"`, `--shiki-dark` present, and the copy button's `aria-label="Copy code"`; caption → `<figcaption`. Test `falls back to plain text for unknown languages`: `"Swift"` → `<pre` containing the escaped raw code, no `--shiki-`. Test `renders plain text when highlighting throws`: `vi.mock("@/lib/code-highlight")` so `highlightCode` rejects → same plain output.
- [ ] **Step 2:** `pnpm vitest run src/lib/code-highlight.test.ts src/components/notion-blocks` → FAIL.
- [ ] **Step 3: Install and implement.**
  - `pnpm add shiki hast-util-to-jsx-runtime`.
  - Highlighter: `createHighlighterCore({ themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")], langs: HIGHLIGHT_LANGUAGES.map(l => import(\`shiki/langs/${l}.mjs\`)) /* write each import literally so bundlers see them */, engine: createJavaScriptRegexEngine() })`, memoised in a module-level promise (reset on rejection).
  - `CodeBlock`: code text = joined `plain_text` of `block.code.rich_text`. Highlighted children via `toJsxRuntime(codeElement, { Fragment, jsx, jsxs })` from `react/jsx-runtime`, placed inside our `<pre><code className="shiki">`. Frame: `<figure className="max-w-3xl overflow-hidden rounded-lg border border-border bg-muted">`, header row `flex items-center justify-between px-4 py-2 border-b border-border` with `Typography component="span" size="mini"` label and the button; `<pre className="overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">`.
  - `CopyCodeButton`: `copyToClipboard` from `@/lib/clipboard`; ghost icon button (`Copy3` / `Check`, 16px) with the visible text "Copy"/"Copied", 32px tall, `pointer-coarse:` 44px hit area like the footer links; `aria-live="polite"` status. Failure leaves it as "Copy".
  - `globals.css`: `.shiki span { color: var(--shiki-light); }` and `.dark .shiki span { color: var(--shiki-dark); }`.
- [ ] **Step 4:** tests → PASS; `pnpm typecheck` → no errors.
- [ ] **Step 5: Commit** `"Notion blocks: code blocks highlighted with shiki on the server, with a copy button"`

### Task 7: BrandMark and the static page layout

**Files:**
- Create: `src/components/brand-mark.tsx`
- Modify: `src/components/landing/landing-hero.tsx` (use `BrandMark` inside its existing `data-landing-block="mark"` div)
- Modify: `src/components/static-page.tsx`
- Test: `src/components/static-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 `buildPageIdToPath`; Task 2 `formatUpdatedDate`; Task 3 `NotionBlocks`, `createRenderContext`; `getPageBySlug`, `getPublishedPages` from `@/lib/notion`; `STATIC_PAGES`.
- Produces: `BrandMark(): JSX.Element` (pearl `aria-hidden` + "Purl" text, no link); `StaticPage({ slug })` and `staticPageMetadata(slug)` with unchanged signatures.

- [ ] **Step 1: Write the failing tests** (`static-page.test.tsx`, mocking `@/lib/notion` `getPageBySlug` / `getPublishedPages` and `next/navigation` `notFound` to throw):
  - renders `<header` with `<a href="/" aria-label="Purl, home"`, one `<h1` with the title, the description, `<time dateTime="2026-10-03T23:30:00.000Z"` and text `Updated October 3, 2026`, and the footer (`aria-label="Footer"`).
  - test `renders no body container for an empty page`: `blocks: []` → no `flex flex-col gap-4` body div after the header block.
  - missing description → no description paragraph.
  - a paragraph block linking to the privacy page's notion URL renders `href="/privacy"` (proves `pageIdToPath` is wired).
  - `getPageBySlug` → null → `notFound` called.
  - `staticPageMetadata("privacy")` → `{ title, description, alternates: { canonical: "/privacy" }, openGraph: { title, description, url: "/privacy" }, twitter: { title, description } }`; description keys omitted when empty.
- [ ] **Step 2:** `pnpm vitest run src/components/static-page.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
  - `BrandMark`: the hero's markup (`flex items-center gap-2.5`, `Logo size={24}` in an `aria-hidden` span, `Typography component="span" className="text-lg font-semibold tracking-[-0.01em] text-foreground"`). Hero renders `<div data-landing-block="mark"><BrandMark /></div>` — markup otherwise identical (e2e `landing.spec.ts` must still pass).
  - `StaticPage` layout per spec §1: outer `wrapper-public flex w-full flex-1 flex-col px-4 md:px-6 lg:px-12`; `<header className="pt-12 sm:pt-16 md:px-[6%] md:pt-20">` with the link (`inline-flex rounded-sm` + footer focus ring + `pointer-coarse:min-h-11`); `<main className="flex w-full flex-1 flex-col md:px-[6%]">` with `h1` (`variant="h2"`, `mt-8 md:mt-10`), description (`text-lg text-pretty max-w-[60ch] mt-3.5`), Updated line (`size="small" mt-4`), then `NotionBlocks` in a `mt-10` wrapper only when `blocks.length > 0`; then `<LandingFooter />`.
  - Read `getPublishedPages()` alongside the page with the same build-time fallback as `readStaticPage` (generalise it to `readAtBuild<T>(read, fallback, label)`), build `pageIdToPath`, `createRenderContext(slug, pageIdToPath)`.
- [ ] **Step 4:** → PASS; `pnpm test`, `pnpm typecheck`, `pnpm lint` → clean.
- [ ] **Step 5: Commit** `"Static pages: Purl mark, title, description, Updated line, Notion content and footer"`

### Task 7.5: Footer "@nublson" link from `NUBLSON_URL`

**Files:**
- Create: `src/lib/author-url.ts`
- Modify: `src/components/landing/landing-footer.tsx` (the "@nublson" `href`), `.env.example` (document `NUBLSON_URL`), `e2e/landing.spec.ts` (expected href)
- Test: `src/lib/author-url.test.ts`

**Interfaces:**
- Produces: `AUTHOR_FALLBACK_URL = "https://github.com/nublson"`; `getAuthorUrl(env?: string | undefined = process.env.NUBLSON_URL): string` — the trimmed value when it parses as an `https:` URL, else the fallback.

- [ ] **Step 1: Write the failing tests:** `getAuthorUrl("https://nublson.com")` → `"https://nublson.com"`; `getAuthorUrl("  https://nublson.com/  ")` → `"https://nublson.com/"`; `getAuthorUrl(undefined)`, `getAuthorUrl("")`, `getAuthorUrl("javascript:alert(1)")`, `getAuthorUrl("http://nublson.com")`, `getAuthorUrl("not a url")` → `"https://github.com/nublson"`.
- [ ] **Step 2:** `pnpm vitest run src/lib/author-url.test.ts` → FAIL.
- [ ] **Step 3: Implement** `getAuthorUrl`; `LandingFooter` uses `href={getAuthorUrl()}` (it's a server component; the landing and static pages are static, so the value is read at build/revalidate time, which is when Vercel provides it). `.env.example`: `# Where the footer's "@nublson" links (https only; defaults to https://github.com/nublson)` + `NUBLSON_URL=`. `e2e/landing.spec.ts`: expect `getAuthorUrl()` (import from `../src/lib/author-url`, a plain module) instead of the hard-coded GitHub URL.
- [ ] **Step 4:** unit test → PASS; `pnpm test:e2e e2e/landing.spec.ts` → PASS.
- [ ] **Step 5: Commit** `"Footer: @nublson links to NUBLSON_URL"`

### Task 8: e2e and docs

**Files:**
- Create: `e2e/static-pages.spec.ts`
- Modify: `CLAUDE.md` (Static pages section; landing section mentions `BrandMark`)

- [ ] **Step 1: Write `e2e/static-pages.spec.ts`.** `test.skip(!process.env.NOTION_ACCESS_TOKEN, "Static pages read Notion; set NOTION_ACCESS_TOKEN in .env.local")`. Signed out (`test.use({ signedIn: false })`), for each `STATIC_PAGES` entry: from `/`, click the footer link by name → URL is the path, response 200, `getByRole("link", { name: "Purl, home" })` has `href="/"`, exactly one `heading level 1`, `getByText(/^Updated /)` visible, footer `contentinfo` visible. Signed in (default fixture): `page.goto("/privacy")` → stays on `/privacy` (no redirect), click "Purl, home" → `toHaveURL(/\/home$/)`. Phone width (`page.setViewportSize({ width: 375, height: 812 })`): `document.documentElement.scrollWidth <= 375`.
- [ ] **Step 2:** `pnpm test:e2e e2e/static-pages.spec.ts e2e/landing.spec.ts` → PASS in Chromium and WebKit.
- [ ] **Step 3: Update CLAUDE.md** "Static pages (Notion CMS)": replace "the title for now (body rendering comes next)" with the layout (`BrandMark` link to `/`, h1, description, `Updated <date>` UTC, `NotionBlocks`, `LandingFooter`); the renderer module and supported block list (spec §2), what renders nothing; links rule; linked images only, uploads skipped with a warning, images committed under `public/pages/` and linked as `https://purl.live/pages/<name>`; shiki setup (fine-grained, JS engine, github themes, `.shiki span` CSS vars in globals.css) and the copy button; heading anchors (`heading-slugs.ts`, h2–h4 ids, one slugger per page). Remove the sentence about needing an image proxy like nublson.com's, replacing it with the linked-images rule. Landing section: hero's mark is `BrandMark` (shared with static pages). e2e: `e2e/static-pages.spec.ts` (needs Notion env).
- [ ] **Step 4: Commit** `"Static pages: e2e coverage and CLAUDE.md"`

### Task 9: Go-live checks and full verification

No code unless a check fails.

- [ ] **Step 1: Vercel env (names only).** With the Vercel MCP (`list_projects` → purl project → `filter_project_envs` / `get_project_env` listing, never decrypting) confirm `NOTION_ACCESS_TOKEN`, `NOTION_PAGES_DATA_SOURCE_ID`, `NOTION_WEBHOOK_SECRET` and `NUBLSON_URL` exist for **production** and **preview**. Report any missing to the user; don't create them.
- [ ] **Step 2: Webhook.** Ask the user to confirm the Notion integration's webhook subscription targets `https://purl.live/api/notion/revalidate` (it can't be read through the API). Note it in the final report.
- [ ] **Step 3: Full suite.** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → all pass (build without Notion env must succeed: pages prerender as 404 at build in CI, as today).
- [ ] **Step 4: Browser check.** `preview_start` the dev server; for `/privacy` and `/docs/mcp`: screenshot light and dark (`resize_window` `colorScheme`) and at mobile preset; check console errors; check the mark sits at the same x as on `/`. Temporarily add a code block / heading / list to verify rendering only if the user agrees to edit Notion — otherwise rely on the render tests.
- [ ] **Step 5: Report** to the user: what shipped, the Vercel env result, the webhook question, and the post-merge check from the spec (all four pages on `dev.purl.live`, signed in and out, both themes, phone width). Don't open a PR unless asked.
