# Live Embeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pages the owner switches to "Show live" render as a live, sandboxed iframe on their desktop grid card (click to interact) and large in the media viewer everywhere.

**Architecture:** A pure header check (`src/lib/frameable.ts`) runs when `PATCH /api/links/[id] { embed: true }` arrives; the existing `Link.embed` column stores the choice. `linkKind` already answers `"embed"`; making `isViewerKind` include it routes live pearls through the viewer machinery (registration, morph, `?pearl=`). One `EmbedFrame` component renders the iframe for the grid face (`EmbedFace`) and the viewer (`EmbedViewerMedia`).

**Tech Stack:** Next.js App Router, React 19, Tailwind 4, Radix dropdown, Motion (`useInView` in `useLiveCards`), Cambio viewer, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-live-embeds-design.md`

## Global Constraints

- No migration: only `Link.embed` (exists, default false). `frameable` stays unused.
- Page pearls only can go live: `contentType` `WEB` or `YOUTUBE`, `upload === false`. Never IMAGE / VIDEO / AUDIO / PDF, never in the landing demo (`useIsDemo`), never switchable on the shared page.
- Copy (exact): menu item "Show live"; toasts "This site doesn't allow being shown live", "Couldn't reach this site"; cover button name "Interact with {title}"; chip "Esc to leave"; card button "Open large"; pill "Live"; failure "Couldn't load" (card), "Couldn't load this page" (viewer); viewer link "Open in new tab".
- Error codes: `NOT_FRAMEABLE`, `UNREACHABLE`, `INVALID_EMBED` (all 400).
- Rate limit: `embed: true` requests are limited per user with the existing `getLinkPreviewRateLimiter()` (60 a minute) inside the PATCH route (the proxy can't read the body; this replaces the spec's "in the proxy").
- Timeouts: header check 5 s; frame load fallback 8 s (`EMBED_LOAD_TIMEOUT_MS`), overridable in e2e through `window.__purlEmbedTimeoutMs`.
- Grid: square face (`aspect-square`), 1:1 iframe, at most `MAX_LIVE_CARDS` (6) live through `useLiveCards`; fade-in 150 ms opacity `ease-out-strong`, none under reduced motion.
- Viewer box: 16:10 when the viewport is wider than tall, 3:4 otherwise, within `MAX_WIDTH` / `MAX_HEIGHT` (`src/components/media-viewer-media.tsx`).
- iframe attributes (exact): `loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox" allow="autoplay; fullscreen; clipboard-write; picture-in-picture"`, `title` = the link's title. No `allow-top-navigation`.
- CSP `frame-src` (exact): `frame-src 'self' https: https://vercel.live https://*.vercel.live`.
- Project rules: Reicon icons only; `Typography` for p/span/a text; all outbound HTTP through `safeFetch`; never commit to `develop`.

## Review Focus

- A URL that redirects to a host that blocks framing: the check reads the **final** response's headers (`safeFetch` follows redirects) and refuses. Test in Task 1.
- A page that answers 4xx/5xx to both HEAD and GET: treated as unreachable (`UNREACHABLE`), never as "allowed because no headers". Test in Task 1.
- A live card that is deleted, moved out, or switched off while it is the active (interacting) card: the active-embed store is cleared on unmount, so no other card stays blocked and Esc does nothing stale. Test in Task 5.
- Switching "Show live" on a pearl whose URL changed since save (edited URL): the check uses the stored `url` at PATCH time, not the original. Test in Task 3.
- The keyboard inside the viewer's frame: Esc there doesn't close the viewer, but Tab out of the frame still reaches the keyboard-only Close. Test in Task 7.

---

### Task 1: Framing check

**Files:**
- Create: `src/lib/frameable.ts`
- Test: `src/lib/frameable.test.ts`

**Interfaces:**
- Produces: `isFrameable(headers: Headers, origin: string): boolean`; `checkFrameable(url: string): Promise<"allowed" | "blocked" | "unreachable">`.

- [ ] **Step 1: Write the failing tests** (`isFrameable` with `origin = "https://purl.live"`):
  - no framing headers → `true`
  - `X-Frame-Options: DENY` → `false`; `SAMEORIGIN` → `false`; `ALLOW-FROM https://purl.live` → `false`
  - CSP `frame-ancestors *` → `true`; `frame-ancestors https:` → `true`; `frame-ancestors https://purl.live` → `true`; `frame-ancestors 'self' https://other.example` → `false`; `frame-ancestors 'none'` → `false`
  - CSP without `frame-ancestors` (`default-src 'self'`) → `true`
  - two CSP values joined (`Headers.append`), the second with `frame-ancestors 'none'` → `false`
  - `X-Frame-Options` present plus `frame-ancestors *` → `false`
  - `checkFrameable` (stub `globalThis.fetch`, as `src/vitest.setup.ts` routes `safeFetch` through it): HEAD 200 no headers → `"allowed"`; HEAD 405 then GET 200 with `x-frame-options: deny` → `"blocked"`; HEAD and GET 404 → `"unreachable"`; fetch rejects → `"unreachable"`; a 301 to a URL whose 200 answer has `x-frame-options: deny` → `"blocked"`.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/frameable.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** `isFrameable` (parse each CSP value's directives split on `;`, sources split on whitespace, case-insensitive directive name) and `checkFrameable` (`safeFetch(url, { method: "HEAD", signal: timeoutSignal(5000) })`; on status 405/501 or a rejected HEAD, retry `GET` with the same timeout and cancel its body; status ≥ 400 → `"unreachable"`; origin from `BASE_URL`, falling back to `https://purl.live` as `src/lib/uploads.ts` does).

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Commit** `feat: framing check for live embeds`.

### Task 2: Which pearls can go live, and the viewer kind

**Files:**
- Create: `src/lib/embeds.ts`, `src/lib/embeds.test.ts`
- Modify: `src/lib/link-kind.ts` (`isViewerKind`), its test if one exists (else add cases to `src/lib/media-viewer.test.ts`)

**Interfaces:**
- Produces: `canEmbed(link: Pick<Link, "contentType" | "upload">): boolean` (WEB or YOUTUBE and not `upload`); `embedSrc(link: Pick<Link, "url">): string` (`getYouTubeEmbedUrl(link.url) ?? link.url`; find `getYouTubeEmbedUrl`'s module with grep); `isViewerKind("embed") === true`.

- [ ] **Step 1: Write the failing tests:** `canEmbed` true for WEB and YOUTUBE links, false for PDF/IMAGE/VIDEO/AUDIO and for `upload: true`; `embedSrc` of `https://www.youtube.com/watch?v=abc` → `https://www.youtube-nocookie.com/embed/abc`, of `https://www.sanding.space/demos/search-expand` → itself; `isViewerLink({ contentType: "WEB", embed: true })` → true, `({ contentType: "AUDIO", embed: false })` → false.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/embeds.test.ts src/lib/media-viewer.test.ts` — FAIL.
- [ ] **Step 3: Implement**; update `isViewerKind`'s doc comment (image, video and live pages).
- [ ] **Step 4: Run** the tests, then `pnpm typecheck` — PASS. Grep `isViewerKind` callers (`link-card.tsx`, `link-item.tsx`, `shared-link-card.tsx`, `shared-link-item.tsx`, media viewer URL code) and confirm none assumes image/video only beyond what Tasks 5–7 change.
- [ ] **Step 5: Commit** `feat: live pages are viewer pearls`.

### Task 3: The switch on the server, and the CSP

**Files:**
- Modify: `src/app/api/links/[id]/route.ts` (PATCH), `src/lib/links.ts` (`UpdateLinkData`, `updateLinkForUser`), `src/lib/csp-header.ts` (+ `csp-header.test.ts`)
- Test: `src/app/api/links/[id]/route.test.ts`

**Interfaces:**
- Consumes: `checkFrameable`, `canEmbed`.
- Produces: `PATCH /api/links/[id]` accepts `{ embed: boolean }` alone or with other fields; answers the serialized link (with `embed`) or `400 { error, code }`.

- [ ] **Step 1: Write the failing route tests** (mock `checkFrameable`, the session and Prisma as the file already does):
  - `embed: true` on a WEB link, `"allowed"` → 200, `embed: true` written
  - `"blocked"` → 400 `NOT_FRAMEABLE`, error "This site doesn't allow being shown live", nothing written
  - `"unreachable"` → 400 `UNREACHABLE`, "Couldn't reach this site"
  - an upload or an IMAGE link → 400 `INVALID_EMBED`, `checkFrameable` not called
  - YouTube link → 200 without calling `checkFrameable`
  - `embed: false` → 200, `checkFrameable` not called
  - `embed: "yes"` → 400 (invalid body)
  - the check receives the link's **stored** url (seed a link whose url differs from its original save) (Review Focus)
  - rate limit: limiter mock returning `success: false` → 429, only for `embed: true`
- [ ] **Step 2: Run** `pnpm vitest run 'src/app/api/links/[id]/route.test.ts'` — FAIL.
- [ ] **Step 3: Implement:** accept `embed` in `PatchBody` and the "at least one field" check; load the user's link (existing lookup) before the check; `UpdateLinkData.embed?: boolean` written by `updateLinkForUser`. Change `frame-src` to the Global Constraints value and update `csp-header.test.ts` and the comment above it.
- [ ] **Step 4: Run** both test files and `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: switch a page pearl live, checked when turned on`.

### Task 4: "Show live" in the menu

**Files:**
- Modify: `src/components/link-menu.tsx`; `src/components/layout-menu-items.tsx` (export its `SwitchIndicator` for reuse)
- Create: `src/components/show-live-menu-item.tsx`
- Test: `e2e/embeds.spec.ts` (create)

**Interfaces:**
- Consumes: `canEmbed`, the PATCH contract.
- Produces: `ShowLiveMenuItem({ link }: { link: Link })`.

- [ ] **Step 1: Write the failing e2e tests** (signed in, Chromium + WebKit, network: like `paste-many.spec.ts`):
  - seed a WEB link `https://example.com`; its row menu has a `menuitemcheckbox` "Show live", unchecked; checking it PATCHes and the item reads checked; after reload the row shows the "Live" mark (Task 6 adds the mark: assert `aria-checked` on reopen here).
  - seed `https://github.com`; checking it shows the toast "This site doesn't allow being shown live" and the item stays unchecked.
  - an IMAGE link's menu has no "Show live".
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/embeds.spec.ts` — FAIL.
- [ ] **Step 3: Implement** a `DropdownMenuCheckboxItem` like `FolderTagsMenuItem` (switch indicator, `onSelect` preventDefault, `HapticTarget`, `haptic("selection")`), optimistic checked state, `fetch` PATCH, on error revert + `toast.error(body.error)`, on success `notifyLinksChanged()` (`useLinksSyncActions`). Render it in `LinkMenu` when `canEmbed(link) && !isDemo`, after "Open in new tab".
- [ ] **Step 4: Run** the e2e and `pnpm lint` — PASS.
- [ ] **Step 5: Commit** `feat: Show live switch in the link menu`.

### Task 5: The live grid card

**Files:**
- Create: `src/components/embed-frame.tsx`, `src/components/embed-face.tsx`, `src/lib/active-embed.ts` (+ `active-embed.test.ts`)
- Modify: `src/components/shared-link-card.tsx` (`LinkCardContent` case `"embed"`), `src/components/link-card.tsx`, `SharedLinkCard` (same file)
- Test: `e2e/embeds.spec.ts`

**Interfaces:**
- Consumes: `embedSrc`, `useLiveCards(ref, wanted): boolean`, `MediaOpenButton`.
- Produces: `EmbedFrame({ link, onLoad, className })` (the iframe with the Global Constraints attributes); `EMBED_LOAD_TIMEOUT_MS = 8000` and `embedLoadTimeoutMs(): number` (reads `window.__purlEmbedTimeoutMs`) in `embed-frame.tsx`; `activeEmbed` store `{ get(): string | null; set(id: string | null): void; clearIf(id: string): void; subscribe(listener: () => void): () => void }` and `useIsActiveEmbed(id): boolean`; `EmbedFace({ link, anchored })`.

- [ ] **Step 1: Write the failing tests.** Unit (`active-embed.test.ts`): setting a second id replaces the first; `clearIf(id)` clears only that id. e2e (desktop, seeded `embed: true` WEB rows, `page.route("https://live.example/**")` serving `<button>Inside</button>`):
  - the card's face is square (bounding box width ≈ height) and shows the frame (`iframe[title="Live demo"]`) after load
  - the wheel over the card scrolls `<main>` (scrollTop grows)
  - clicking the "Interact with Live demo" button gives the square a ring and removes the cover; the frame's "Inside" button is clickable (`frameLocator`); Esc returns the cover
  - clicking the card's title strip opens the viewer (`dialog` named by the title); so does "Open large"
  - with `window.__purlEmbedTimeoutMs = 300` and the route aborted, "Couldn't load" shows and the preview stays
  - deleting the active card (row menu Delete) leaves no active embed: another card's cover still activates on first click (Review Focus)
  - phone (`hasTouch`, 390×844): no iframe, the "Live" pill shows, a tap opens the viewer
  - signed out, a public folder holding an `embed: true` link shows its square live card to the visitor (`SharedLinkCard`)
- [ ] **Step 2: Run** them — FAIL.
- [ ] **Step 3: Implement.** `EmbedFace`: `aspect-square` box; preview image (as `LinkPreviewThumbnail` / globe) under the frame; frame mounted when `useLiveCards(ref, !coarse && !selecting)` holds a slot and not failed; opacity fade on load (`motion-safe:transition-opacity duration-150 ease-out-strong`); timer `embedLoadTimeoutMs()` → failed; cover `<button aria-label={`Interact with ${title}`}>` above the frame and above the card's `MediaOpenButton` (`z-[1]`), `pointer-coarse:hidden`; active state from `useIsActiveEmbed`, Esc listener on `document` and outside `pointerdown` clear it, unmount calls `activeEmbed.clearIf(id)`; chip "Esc to leave"; "Live" pill `pointer-fine:hidden`. Cards: for kind `embed`, render `EmbedFace` then the existing favicon/title/domain strip; "Open large" (Reicon `Maximize` or the closest expand icon; check names with `grep -o "Maximize[A-Za-z0-9]*\|Expand[A-Za-z0-9]*" node_modules/reicon-react/index.d.ts`) beside the `⋯`, same reveal; no press-scale while active; selecting keeps the cover (it toggles selection) and sets `inert` on the frame.
- [ ] **Step 4: Run** unit + e2e (Chromium, WebKit) and `pnpm lint` — PASS.
- [ ] **Step 5: Commit** `feat: live grid cards with click to interact`.

### Task 6: The "Live" mark on list rows

**Files:**
- Modify: `src/components/link-item.tsx`, `src/components/shared-link-item.tsx`
- Test: `e2e/embeds.spec.ts`

**Interfaces:**
- Consumes: `linkKind`, `isViewerKind` (Task 2 already routes the row's click to the viewer).

- [ ] **Step 1: Write the failing e2e test:** list view, an `embed: true` row shows a "Live" text mark after its title and a click opens the viewer (not a new tab: no `popup` event); its hover preview shows an `img`, no `iframe`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** a small `Typography` span ("Live", `text-xs text-muted-foreground`, `shrink-0`) after the title when `kind === "embed"`, in both rows; keep the preview body's existing page branch (`LinkPreviewBody` must not mount `EmbedFrame`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: live rows open the viewer, marked Live`.

### Task 7: Live pages in the media viewer

**Files:**
- Modify: `src/components/media-viewer-media.tsx` (`ViewerMedia` case `"embed"`, new `EmbedViewerMedia`), `src/components/media-viewer.tsx` (header line), `src/lib/media-viewer-url-hook.ts` only if its standalone fetch filters by image/video explicitly (it should use `isViewerLink`)
- Test: `e2e/embeds.spec.ts`, `e2e/media-viewer.spec.ts` (only if a shared expectation changes)

**Interfaces:**
- Consumes: `EmbedFrame`, `embedLoadTimeoutMs`, `MAX_WIDTH`, `MAX_HEIGHT`, the viewer's `ready` flag.
- Produces: `embedBoxRatio(viewport: { width: number; height: number }): "16 / 10" | "3 / 4"` (exported, unit-tested in `src/lib/embeds.test.ts`).

- [ ] **Step 1: Write the failing tests.** Unit: `embedBoxRatio({width: 1440, height: 900})` → `"16 / 10"`, `({width: 390, height: 844})` → `"3 / 4"`. e2e:
  - opening a live card shows the dialog with the preview, then the frame (`dialog iframe`) once ready; the box ratio ≈ 1.6 at 1440×900 and ≈ 0.75 on a phone
  - the header line shows the title, the domain and an "Open in new tab" link to the URL with `target="_blank"`
  - Next from an image reaches the live pearl and back; audio is still skipped
  - `?pearl=<live id>` on load opens it; on the shared page too (visitor)
  - after focusing into the frame (`frameLocator(...).locator("button").focus()`), pressing Tab eventually focuses the dialog's "Close" (Review Focus)
  - with the route aborted and `__purlEmbedTimeoutMs = 300`: "Couldn't load this page" (`role="status"`) and the link
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `EmbedViewerMedia`: box `width: min(MAX_WIDTH, (MAX_HEIGHT) * ratio)` with `aspect-ratio` from `embedBoxRatio(window size)` (read once on mount); preview image until `ready`, then `EmbedFrame` with the fade and the timer; failure state as specified. Header line: inside the Popup above the box, favicon (`LinkIcon size="small"`), title (`truncate`, full in `title`), domain, and the link; drawn only for `embed` pearls; the Popup's size rules keep the box within `MAX_HEIGHT` minus the header's height (subtract it in `MAX_HEIGHT` for the embed branch: `calc(... - 32px)`).
- [ ] **Step 4: Run** unit, `e2e/embeds.spec.ts` and `e2e/media-viewer.spec.ts` (Chromium, WebKit) — PASS.
- [ ] **Step 5: Commit** `feat: live pages in the media viewer`.

### Task 8: Docs and full check

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** Replace the "Embeds (…) are a later plan" sentence under "Not built yet" with an **Embeds** bullet in the Folders section describing: the switch and its check (`frameable.ts`, codes, rate limit), `embedSrc`, `EmbedFrame`'s sandbox and the CSP `frame-src`, the grid card (square, slots, cover, active store, "Open large", touch pill, 8 s fallback), rows' "Live" mark, the viewer box and header line, and `e2e/embeds.spec.ts` (needs network for the switch).
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm test` — all pass; `pnpm exec playwright test e2e/embeds.spec.ts e2e/media-viewer.spec.ts e2e/owner-grid.spec.ts e2e/shared-folders.spec.ts` — pass (known pre-existing failures: `landing-demo.spec.ts:138`, the Share-button test in `shared-folders.spec.ts`).
- [ ] **Step 3: Commit** `docs: live embeds in CLAUDE.md`.
