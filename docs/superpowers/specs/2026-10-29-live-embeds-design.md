# Live Embeds — Design

**Date:** 2026-10-29
**Builds on:** `2026-10-27-media-uploads-embeds-design.md` (its Embeds section is superseded by this one), `2026-10-27-media-viewer-design.md` (the viewer, its morph and URL state).

## Goal

A saved page that allows framing, such as an interactive demo (`https://www.sanding.space/demos/search-expand` sends `frame-ancestors *`), can be shown **live** in Purl: on its grid card on desktop, and large in the media viewer everywhere. Articles keep opening in a new tab; only pearls the owner switches on go live.

## Decisions

Settled with the user during brainstorming:

- **Live in the grid and in the viewer (option C).** Desktop grid cards render the page live; the media viewer shows it large on every device; phones show the card's preview and open the viewer.
- **Opt-in per pearl.** A "Show live" switch; nothing goes live by itself. No known-player defaults (the October plan's YouTube/Vimeo/… list) beyond YouTube's embed URL when YouTube is switched on.
- **Real size in the card.** The iframe is the card's square at 1:1 pixels, so the page lays out for a ~210px window. Scaled-down desktop renders were rejected (controls too small to use).
- **Click to interact.** A transparent cover keeps scrolling the grid; one click hands the pointer to the page. Hover-to-interact and always-interactive were rejected (the wheel would scroll the page whenever the cursor crossed a live card).
- **Square cards.** 210 × 210 of page, then the title strip. 16:10 (too short for a demo) and 4:5 (tallest card) were rejected.
- **Check framing when switched on**, not at every save: saving stays as fast as today, old links need no backfill, and the answer is current. The `frameable` column stays unused.

Out of scope (later steps): providers beyond YouTube (Vimeo, Loom, Figma, CodePen, X); the switch in the v1 API, MCP or the edit dialog; PDFs; live frames in list rows; per-pearl aspect ratio.

## 1. Switching a pearl live

**Where:** a "Show live" item in the row and card menu (`LinkMenu`), a checkbox item drawn with a switch like `FolderTagsMenuItem` (`src/components/layout-menu-items.tsx`), menu stays open. Shown for page pearls only: `contentType` `WEB` or `YOUTUBE`, not uploads (`upload`), not `IMAGE` / `VIDEO` / `AUDIO` / `PDF`, not in the landing demo, never on the shared page.

**Turning it on:** `PATCH /api/links/[id]` (app, browser session) accepts `embed: boolean`.

- `embed: true` runs `checkFrameable(url)` (`src/lib/frameable.ts`): fetch the page through `safeFetch` (HEAD, falling back to GET when HEAD is refused or answers 405; 5 s timeout; redirects followed by `safeFetch`'s rules), then `isFrameable(headers)`:
  - an `X-Frame-Options` header with any value → `false`;
  - a `Content-Security-Policy` header (every value, comma-joined) with a `frame-ancestors` directive → `true` only if its sources include `*`, `https:` or Purl's origin (`BASE_URL`); `'none'` or anything else → `false`;
  - neither header → `true`.
  Only response headers count (browsers ignore `frame-ancestors` in `<meta>`). A fetch that fails or times out → "unreachable".
- Allowed → the row's `embed` is set; the response is the serialized link.
- Refused → `400 { error, code: "NOT_FRAMEABLE" }` ("This site doesn't allow being shown live"); unreachable → `400 { error, code: "UNREACHABLE" }` ("Couldn't reach this site"). The client reverts the switch and toasts the message.
- Not a page pearl → `400 { code: "INVALID_EMBED" }`.
- `embed: false` → always allowed, no fetch.
- The `embed: true` request is rate-limited per IP like the link preview (`link_preview`, 60 a minute) in the proxy.

**What gets framed:** `embedSrc(link)` (`src/lib/embeds.ts`, pure): YouTube URLs → `getYouTubeEmbedUrl` (`youtube-nocookie`, exists; YouTube's own pages refuse framing, so YouTube skips `checkFrameable`); anything else → `link.url`.

**Data:** only the existing `Link.embed` column (default false). No migration. `serializeLink`, `Link` (`src/utils/links.ts`) and the shared folder's `PublicLink` (`PUBLIC_LINK_SELECT`) carry `embed`. `linkKind(link)` already answers `embed` when it's set.

## 2. The live grid card (desktop)

A live pearl (`linkKind` `embed`) in the grid (`LinkCard` and `SharedLinkCard`, through `LinkCardContent`) is a **square** face at the card's width, then the usual favicon / title / domain strip.

**Loading:** `EmbedFace` (`src/components/embed-face.tsx`):

- The square first shows the preview (`thumbnail` through `safeRemoteImgSrc`, else the globe on `bg-muted`), `object-cover`.
- The iframe (`EmbedFrame`, §4) mounts only while the card holds one of the `MAX_LIVE_CARDS` (6) slots from `useLiveCards` (within 200px of the viewport, shared with playing videos); losing the slot unmounts it and the preview shows again.
- On `load` the frame fades in over the preview (150 ms, opacity, `ease-out-strong`; none under reduced motion).
- No `load` within 8 s → the frame is removed, the preview stays, and a small "Couldn't load" chip shows in the square's bottom-left; the card still opens the viewer (which tries again).

**Click to interact:**

- Over the frame sits a transparent cover, a `<button>` named "Interact with *title*": wheel and drag pass to the grid's scroll, never the page.
- A click or Enter on the cover makes the card **active**: the cover hides, the square shows `ring-2 ring-ring`, a chip in its bottom-right reads "Esc to leave", and pointer events reach the page.
- Leaving: Esc while focus is in Purl (focus inside the frame belongs to the page), a pointerdown outside the card, the card scrolling out of view (its live slot lost), or another card becoming active. One active card at a time (`activeEmbed` in a small store, `src/lib/active-embed.ts`).
- While active the card doesn't press (no 0.98), and its long-press is off.

**Opening the viewer:** the title strip is the card's opener (`MediaOpenButton`, as for image and video cards); a small "Open large" button (Reicon expand icon, 24 px, `bg-background/80`) in the square's top-right, left of the `⋯`, shows on hover and keyboard focus and opens the viewer too.

**Card chrome:** checkbox top-left, `⋯` (and on Home the folder button) top-right, the folder badge, and selection behave as on every card. While selecting, the cover stays, `inert` is set on the frame, and a click on the cover toggles selection.

**Touch screens** (`pointer-coarse:`): no frame and no cover. The square shows the preview with a "Live" pill (top-left, under the checkbox's corner rules); a tap opens the viewer.

**List rows** (`LinkItem`, `SharedLinkItem`): unchanged rows (favicon, title, second line) with a small "Live" mark after the title; the row's opener is `MediaOpenButton`, so a click opens the viewer instead of a new tab. The row's hover preview shows the preview image, not a frame.

## 3. Live pages in the media viewer

**Registration:** `isViewerLink` (and `isViewerKind`) include `embed`, so live pearls are registered in display order with images and videos; Previous / Next move through all three; audio is still skipped.

**Box:** a fixed shape, as large as the viewer allows (`MAX_WIDTH`, `MAX_HEIGHT`: 1200 px wide, 80% of the height, 800 px):

- 16:10 on screens wider than tall;
- 3:4 on portrait screens (a phone: ~343 × 457), so a page gets height.

The page lays out at the box's real size.

**Morph and mount:** the box morphs out of the card's square (or the row's icon) like any viewer pearl, showing the preview during the morph; the iframe mounts once the morph is `ready` (as a video's player does) and fades in on `load` (150 ms). Reduced motion: no morph (Cambio's `reduced` preset), no fade.

**Interaction:** the frame is live at once (no cover). Keys typed inside the page stay in the page, so Esc there doesn't close the viewer; the backdrop, Back, the arrows beside the box and the keyboard-only Close still do. Swipes can't start on the frame; on phones the arrows always show and the backdrop above and below the 80% box closes it.

**Header line:** above the box, inside the dialog: favicon, title (one line, truncated, full in its `title`) and domain, then an "Open in new tab" link (a real `<a target="_blank" rel="noopener noreferrer">`). It is the way out for a page that misbehaves framed, and gives screen readers context before the page.

**Failure:** no `load` within 8 s → the preview stays, with "Couldn't load this page" and the "Open in new tab" link under it (`role="status"`).

**URL:** `?pearl=<id>` opens a live pearl like any viewer pearl, on Home, folder pages (fetched standalone when off the list) and the shared page.

## 4. Security

**`EmbedFrame`** (`src/components/embed-frame.tsx`), one component for the card and the viewer:

```html
<iframe src={embedSrc(link)} title={link.title} loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
  allow="autoplay; fullscreen; clipboard-write; picture-in-picture" />
```

`allow-same-origin` runs the page as its own origin (never Purl's); there is no `allow-top-navigation`, so a framed page can't navigate Purl away.

**CSP** (`src/lib/csp-header.ts`, production): `frame-src` becomes `'self' https:` plus the existing Vercel entries (it allowed only `https://www.youtube-nocookie.com`). Nothing else widens; the sandbox, not the CSP, bounds a framed page. `pnpm dev` sends no CSP, so a unit test pins the header.

**A site that changes its mind** after the switch was turned on: the browser shows its blocked-frame page and Purl isn't told; the 8 s fallback (card and viewer) covers a frame that never loads. The switch stays on; switching it off and on re-checks.

## Testing

**Unit (Vitest):** `isFrameable` (every header case: XFO values, `frame-ancestors` with `*` / `https:` / Purl's origin / other origins / `'none'`, several CSP headers, none); `checkFrameable` (HEAD → GET fallback, timeout → unreachable; `fetch` stubbed); `embedSrc`; the PATCH route (allowed, `NOT_FRAMEABLE`, `UNREACHABLE`, `INVALID_EMBED`, `false` without a fetch); the CSP string; `isViewerLink` with `embed`.

**e2e** (`e2e/embeds.spec.ts`, Chromium and WebKit). The switch's check runs on the server through `safeFetch`, which refuses localhost, so the switch tests need the network, like the existing save test: `https://example.com` (no framing headers: allowed) and `https://github.com` (`X-Frame-Options: deny`: refused). Everything else seeds rows with `embed: true` and serves the framed page in the browser with `page.route` (a small HTML stub; `route.abort()` for a frame that never loads):

- the switch turns on for a frameable page and is refused (toast, switch back) for a blocking one;
- the card shows the preview, then the frame; the cover takes the wheel; a click makes it active (ring), Esc and a click outside give the pointer back;
- the title strip and the "Open large" button open the viewer with the frame and the header line;
- Previous / Next move between an image and a live pearl;
- on a phone, the card shows the preview and the "Live" pill, and a tap opens the viewer;
- the shared page shows live cards to a visitor;
- a frame that never loads falls back after 8 s (with a shortened timeout via a test hook).

**Docs:** CLAUDE.md gets an "Embeds" section and loses the "Embeds … are a later plan" line.
