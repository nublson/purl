# Media Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Image, video and audio pearls open in an in-app viewer that morphs out of the card or row you clicked, moves between the list's media pearls, lives in the URL as `?pearl=<id>`, and morphs back into the card you end on.

**Architecture:** One `Cambio.Root` per page (Home, a folder, the shared page) holds the viewer, controlled by a small store outside React. Cards and rows don't use `Cambio.Trigger`: each media face wraps its media in a Motion `m` element with `layoutId="pearl-<id>"`, and clicking it opens the viewer, whose Popup carries the same id, so Motion morphs between them. Navigation slides inside the Popup; the Root's `layoutId` is swapped to the current pearl on the frame before closing so the morph lands on the card you end on.

**Tech Stack:** Next.js 16 App Router, `cambio` 1.1.5 (Base UI Dialog + Motion), Motion 12 (`LazyMotion` with `domMax`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-media-viewer-design.md`.

## Global Constraints

- `cambio` pinned at `1.1.5`; after install, `pnpm why motion` must show one copy of `motion` (Cambio wants `^12.23`, the app has `^12.38`).
- Icons from `reicon-react`, named imports only.
- Copy, verbatim: button names "Previous pearl", "Next pearl", "Close"; the live region "3 of 12: Morning birds" (`${index + 1} of ${count}: ${title}`); the broken-video line "Can't play this video"; the dialog's accessible name is the pearl's title, its description `uploadMeta(link) ?? formatDomain(link.domain)`.
- `layoutId` is `"pearl-" + link.id` on faces and on the Root; Cambio presets: `smooth` for cards, `snappy` for rows; `dismissible={false}` on the Root (the drag is ours).
- Swipe thresholds: 80px distance or 400px/s velocity, both axes; horizontal navigates, vertical closes. Slide 200ms on `var(--ease-out-strong)`; under reduced motion a 150ms opacity crossfade and no drag scale; drag scales the media to 0.95.
- Popup box: `max-width: min(100vw - 32px, 1200px)`, `max-height: calc(100dvh - 32px)` plus safe areas on phones; media `object-contain`; backdrop `bg-background/85 backdrop-blur-[12px]`; buttons 44px on touch; the X top-right inside the safe area.
- URL: open pushes `?pearl=<id>` (other params kept), next/previous `replaceState`, close goes back when the viewer pushed, else strips only `pearl`; `?settings=` is never touched.
- The landing demo registers nothing and renders no viewer.
- Every outbound fetch from the client reuses existing routes (`GET /api/links/[id]` for an unknown `?pearl=` on owner pages); nothing new on the server.
- Commits: conventional subjects, each ending with the `Co-Authored-By:` line your session's attribution reminder gives. `pnpm lint` and `pnpm typecheck` before each commit. Tests: `pnpm vitest run <file>`; e2e `pnpm test:e2e <file>` (local database; `.env.e2e` present).

## Review Focus

1. The current pearl is deleted while the viewer is open (another tab, or the row menu's Undo window ending): the viewer moves to a neighbour, or closes with no error. Pinned in Task 2.
2. A `?pearl=<id>` that isn't the user's or doesn't exist: no viewer, no error toast, the param stripped. Pinned in Task 8.
3. A click on a media card while links are selected toggles the selection and never opens the viewer. Pinned in Task 4.
4. Two arrow presses faster than the slide: the viewer ends on the right pearl, never past an end, never stuck mid-slide. Pinned in Tasks 2 and 7.
5. A video the browser can't play: the poster stays with "Can't play this video" and the native controls. Pinned in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/media-viewer.ts` | The store: items, `openedId`, `currentId`, open/close/next/prev/register, hooks |
| `src/lib/media-viewer-url.ts` | Pure URL helpers over a `history`-like interface; `useMediaViewerUrl()` binds them |
| `src/lib/viewer-drag.ts` | `decideDrag(offset, velocity)`: pure swipe decision |
| `src/components/media-viewer.tsx` | The Cambio dialog, its content by kind, navigation, drag, live region |
| `src/components/media-viewer-lazy.tsx` | `next/dynamic` loader mounted by pages; renders nothing until a media pearl is registered |
| `src/components/media-face-anchor.tsx` | `MediaAnchor`: the `m.div layoutId` wrapper faces and row icons share |
| `src/components/media-open-button.tsx` | `MediaOpenButton`: the overlay/row `<button>` that opens the viewer (shared by cards and rows) |

Modified: `package.json`, `src/lib/motion-features.ts`, `src/app/layout.tsx`, `src/components/media-card-face.tsx`, `src/components/link-card.tsx`, `src/components/shared-link-card.tsx`, `src/components/link-item.tsx`, `src/components/shared-link-item.tsx`, `src/components/link-icon.tsx`, `src/hooks/use-live-cards.ts`, `src/hooks/use-audio-player.ts`, `src/components/home-shell.tsx`, `src/components/shared-folder-list.tsx`, `CLAUDE.md`.

---

### Task 1: Dependency, layout features and the root

**Files:**
- Modify: `package.json`, `src/lib/motion-features.ts`, `src/app/layout.tsx:84`

**Interfaces:**
- Produces: `cambio` installed; `LazyMotion`'s features are `domMax`; the `<body>` carries `isolate` (Cambio's portal requirement: `isolation: isolate` on the layout root).

- [ ] **Step 1:** `pnpm add cambio@1.1.5`, then run `pnpm why motion` and confirm one `motion` version is listed (the app's). If two appear, add a `pnpm.overrides` entry for `motion` to the app's version in `package.json` and re-install.
- [ ] **Step 2:** In `src/lib/motion-features.ts` export `domMax` instead of `domAnimation` and update its comment (layout animations: the media viewer's morph). Add `isolate` to the `<body>` class list in `src/app/layout.tsx`.
- [ ] **Step 3:** `pnpm typecheck && pnpm lint && pnpm test` → clean; `pnpm test:e2e e2e/bulk-selection.spec.ts` → passes (the selection bar is the only `LazyMotion` user today).
- [ ] **Step 4:** Commit `build: add cambio and load Motion's layout features`.

### Task 2: The viewer store

**Files:**
- Create: `src/lib/media-viewer.ts`, `src/lib/media-viewer.test.ts`

**Interfaces:**
- Produces: `type MediaViewerState = { items: Link[]; openedId: string | null; currentId: string | null }`; `type OpenOptions = { preset?: "smooth" | "snappy"; standalone?: boolean }`; `MediaViewerState` also carries `openedPreset: "smooth" | "snappy"` (default `"smooth"`) and `standalone: boolean` (no neighbours, Task 8); `mediaViewer = { register(links: Link[]): void; open(id: string, options?: OpenOptions): void; close(): void; next(): void; prev(): void; subscribe(listener): () => void; getSnapshot(): MediaViewerState }`; `useMediaViewer(): MediaViewerState & { index: number; count: number; current: Link | null; hasPrev: boolean; hasNext: boolean }`; `useIsMediaOpen(id: string): boolean` (true while `openedId === id || currentId === id` and the viewer is open). `register` keeps only `linkKind(link) !== "page" && !== "embed"` pearls, in the order given; `open(id)` is a no-op for an id not registered; `next`/`prev` clamp at the ends; when the current id leaves the list, `currentId` moves to the next item at the same index, else the previous, else the viewer closes; `openedId` follows when it was the one removed.

- [ ] **Step 1: Write the failing tests** (`media-viewer.test.ts`, node environment, driving the store directly and the hooks through `renderHook`-free `getSnapshot`):

```ts
it("registers media pearls only, in order", ...)       // page link dropped, image/video/audio kept
it("open sets both ids; next/prev move currentId and clamp", ...)
it("open of an unregistered id does nothing", ...)
it("re-register drops removed ids and keeps order", ...)
it("removing the current pearl moves to the next, else the previous, else closes", ...) // Review Focus 1
it("rapid next calls past the end stay on the last pearl", ...) // Review Focus 4
it("close clears both ids but keeps items", ...)
```

- [ ] **Step 2:** `pnpm vitest run src/lib/media-viewer.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the store in the `linkSelection` style (`src/lib/link-selection.ts`: module state, `subscribe`, `useSyncExternalStore` hooks with a server snapshot).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: media viewer store`.

### Task 3: URL state

**Files:**
- Create: `src/lib/media-viewer-url.ts`, `src/lib/media-viewer-url.test.ts`

**Interfaces:**
- Consumes: Task 2's `mediaViewer`.
- Produces: `type HistoryLike = { pushState(url: string): void; replaceState(url: string): void; back(): void }`; pure helpers over a URL string: `pearlParam(search: string): string | null`, `withPearl(href: string, id: string): string`, `withoutPearl(href: string): string` (only `pearl` removed; `settings` and the rest kept, `?` dropped when empty); `class ViewerUrl` with `open(id)` (push), `navigate(id)` (replace), `close()` (back when this instance pushed and nothing navigated the page since, else replace without the param) and `onPopState(search)` (calls `mediaViewer.close()` when the param is gone while open); `useMediaViewerUrl()` (client hook): subscribes to the store and the `popstate` event, calls the helpers, and on mount opens `pearlParam(location.search)` once the store's items contain it (returns `{ pendingId: string | null }` so a page can fetch an unknown id, Task 8).

- [ ] **Step 1: Tests**: `withPearl("/home?settings=usage", "abc") === "/home?settings=usage&pearl=abc"`; `withoutPearl("/home?pearl=abc") === "/home"`; `withoutPearl("/home?pearl=abc&settings=usage") === "/home?settings=usage"`; `ViewerUrl` with a fake history: open pushes once, two navigates replace, close after a push calls `back` once, close without a push replaces with the param stripped, `onPopState("")` while open closes the store, `onPopState("?pearl=x")` does nothing.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat: media viewer URL state`.

### Task 4: The viewer with images, from the owner's grid

**Files:**
- Create: `src/components/media-viewer.tsx`, `src/components/media-viewer-lazy.tsx`, `src/components/media-face-anchor.tsx`, `src/components/media-open-button.tsx`, `e2e/media-viewer.spec.ts`
- Modify: `src/components/media-card-face.tsx` (`ImageFace`), `src/components/link-card.tsx:120-147`, `src/components/home-shell.tsx` (beside `setSelectableLinks`, ~845, and the render)

**Interfaces:**
- Consumes: Tasks 2 and 3; `LinkCardStrip`/faces unchanged; `uploadMeta` (`src/lib/upload-meta.ts`), `formatDomain`.
- Produces: `MediaAnchor({ link, className, children })`: `m.div` with `layoutId={"pearl-" + link.id}` (no `layout` prop: faces must not animate when the masonry re-places them; only the shared transition with the Popup runs), rendered inside the app's `LazyMotion` (wrap with `<LazyMotion features={loadMotionFeatures} strict>` once in the face, the way `link-selection-bar.tsx` does; move `loadMotionFeatures` to `src/lib/motion-features-loader.ts` and import it from both). `MediaOpenButton({ link, className, selecting, onClick, children, ...aria })`: a `<button type="button">` named `link.title` calling `mediaViewer.open(link.id)` unless `selecting` (then the caller's toggle runs) or a long-press was consumed. `MediaViewer()` (client): one `Cambio.Root` with `open={currentId !== null}`, `onOpenChange={(open) => !open && mediaViewer.close()}`, `layoutId={"pearl-" + (closingTo ?? openedId)}`, `motion="smooth"`, `dismissible={false}`, `modal`; `Cambio.Portal` → `Cambio.Backdrop` (`bg-background/85 backdrop-blur-[12px]`) and `Cambio.Popup` (the box from the constraints) holding a hidden `Cambio.Title` (title) and `Cambio.Description`, a media wrapper (`tabIndex={-1}`, `initialFocus`), the X (`Cambio.Close`, "Close", 44px on touch, top-right inside the safe area) and, for an image, the preview `<img>` under the original `<img alt={title}>` fading in on load. Close after navigation: set `closingTo = currentId`, then `requestAnimationFrame(() => mediaViewer.close())`. `MediaViewerLazy()` = `next/dynamic(() => import("./media-viewer"), { ssr: false })` rendered only when `useMediaViewer().count > 0`. `HomeShell` calls `mediaViewer.register(shownLinks)` where it calls `setSelectableLinks` (with the `Link` objects, same order, same hidden filter) and renders `<MediaViewerLazy />`; it mounts `useMediaViewerUrl()`. `LinkCard`: for `linkKind(link) !== "page"` the overlay `<a>` becomes `MediaOpenButton` with the same classes and the selection/long-press handling; `ImageFace` wraps its `<img>` box in `MediaAnchor`.

- [ ] **Step 1: Write the failing e2e** (`e2e/media-viewer.spec.ts`, seeding two IMAGE links with `thumbnail` = `${baseURL}/icon.png` and a page link; grid via `chooseView` from `e2e/owner-grid.spec.ts`): a click on the first image card opens `getByRole("dialog", { name: "Shot A" })` containing an `img[alt="Shot A"]`, the URL has `pearl=<id>`; Esc closes it, the URL has no `pearl`, and `document.activeElement` is the card's button named "Shot A"; while selecting (hover the card, click its checkbox, then click the second image card) the card toggles and no dialog opens (Review Focus 3); a click on the page link's card still opens a new tab (`popup` event) and no dialog.
- [ ] **Step 2:** Run `pnpm test:e2e e2e/media-viewer.spec.ts` → FAIL.
- [ ] **Step 3:** Implement the interfaces above.
- [ ] **Step 4:** Run the e2e plus `e2e/owner-grid.spec.ts e2e/media-links.spec.ts e2e/bulk-selection.spec.ts` → PASS in both browsers; `pnpm test`, `pnpm lint`, `pnpm typecheck` → clean. By hand in the browser pane: the morph plays from the card and back.
- [ ] **Step 5:** Commit `feat: media viewer opens image pearls from the grid`.

### Task 5: Video and audio in the viewer, playback hand-off

**Files:**
- Modify: `src/components/media-viewer.tsx`, `src/components/media-card-face.tsx` (`VideoFace`, `AudioFace`), `src/hooks/use-live-cards.ts:56`, `src/hooks/use-audio-player.ts`, `e2e/media-viewer.spec.ts`

**Interfaces:**
- Consumes: `useIsMediaOpen(id)`, `audioPlayerStore.stop(id)`, `useAudioPlayer`.
- Produces: in the viewer, by `linkKind(current)`: video → `<video controls autoPlay playsInline poster={thumbnail}>` (no `autoPlay` under reduced motion, read with the app's `usePrefersReducedMotion` moved from `media-card-face.tsx` to `src/hooks/use-prefers-reduced-motion.ts`), rendered only after `onOpenChangeComplete` (the poster `<img>` morphs until then); on `error`, keep the poster, show "Can't play this video" under it and keep the controls; audio → `ViewerAudio({ link })`: a 56px play button, the scrubber and time (reuse the strip's markup factored into `AudioControls({ link, size: "card" | "viewer" })` in `media-card-face.tsx`), the title above, on `bg-card`. `VideoFace` and `AudioFace` wrap their tile in `MediaAnchor`. `useLiveCards(ref, wanted)` callers pass `wanted && !useIsMediaOpen(link.id)`; `audioPlayerStore.stop(id)` is called by the viewer when it opens on `id`.

- [ ] **Step 1: e2e** (seed a VIDEO link at `${baseURL}/icon.png?v=1` with `thumbnail` the icon and `duration 14`, and an AUDIO link with `${baseURL}/icon.png?a=1` which can't play): the video card's dialog holds `video[controls]` and, meanwhile, the card's `video` is paused; the audio card's dialog holds a "Play …" button and the title; a video whose source fails (route-abort a `https://clips.example/*.mp4` seed) shows the text "Can't play this video" and keeps `video[controls]` (Review Focus 5).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the spec and `e2e/media-links.spec.ts` → PASS; unit suite clean. **Step 5:** Commit `feat: video and audio pearls in the viewer`.

### Task 6: Rows and the shared page

**Files:**
- Modify: `src/components/link-item.tsx:272-300`, `src/components/shared-link-item.tsx:79-96`, `src/components/link-icon.tsx:40-55`, `src/components/shared-link-card.tsx` (`SharedLinkCard`), `src/components/shared-folder-list.tsx`, `e2e/media-viewer.spec.ts`

**Interfaces:**
- Consumes: `MediaOpenButton`, `MediaAnchor`, `mediaViewer.register`, `MediaViewerLazy`, `useMediaViewerUrl`.
- Produces: in `LinkItem` and `SharedLinkItem`, the main `<a>` becomes `MediaOpenButton` for media kinds (same classes, `aria-describedby`, hover-preview focus handlers, selection handling); the row's icon slot (`LinkIcon` for IMAGE/VIDEO/AUDIO) is wrapped in `MediaAnchor` with `motion="snappy"` requested through a `preset` prop the viewer reads from the store (`mediaViewer.open(id, { preset: "snappy" })`; the viewer passes `openedPreset` to `Cambio.Root`'s `motion`). `SharedLinkCard`: the `<a>` becomes `MediaOpenButton` for media kinds (the audio card keeps its sibling player). `SharedFolderList` registers its `links` (media only, in order) after each change and renders `<MediaViewerLazy />` plus `useMediaViewerUrl()`.

- [ ] **Step 1: e2e**: in list view, a click on the image row's title opens the dialog and Esc returns focus to the row's button; on the shared page (a public folder, signed-out context as `e2e/media-links.spec.ts` does), a click on the image card opens the dialog with `?pearl=`, → moves to the next media pearl, Esc closes; the shared audio card's Play still plays inline without opening the dialog.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the spec, `e2e/shared-folders.spec.ts`, `e2e/link-row-phone.spec.ts` → PASS (the two "labelled Share/Public" failures are pre-existing). **Step 5:** Commit `feat: media viewer from rows and the shared folder page`.

### Task 7: Navigation, swipe, preloading, phones

**Files:**
- Create: `src/lib/viewer-drag.ts`, `src/lib/viewer-drag.test.ts`
- Modify: `src/components/media-viewer.tsx`, `e2e/media-viewer.spec.ts`

**Interfaces:**
- Produces: `decideDrag(offset: { x: number; y: number }, velocity: { x: number; y: number }, lock: "x" | "y" | null): "prev" | "next" | "close" | "none"` (80px or 400px/s; `lock` from Motion's `dragDirectionLock`; x → prev/next by sign, y → close by distance regardless of sign, no lock → none). In the viewer: "Previous pearl" / "Next pearl" round icon buttons (`ChevronLeft` / `ChevronRight`, `aria-keyshortcuts`), absent at the ends, always visible on `pointer-coarse`, on hover/focus otherwise; `onKeyDown` on the Popup for ArrowLeft/ArrowRight/Home/End; a `role="status"` live region updated to `"${index + 1} of ${count}: ${title}"` on change; the media wrapper is an `m.div` with `drag`, `dragDirectionLock`, `dragSnapToOrigin`, `dragElastic={0.2}`, `onDragEnd` → `decideDrag`; the slide: `AnimatePresence mode="popLayout"` keyed by `currentId` with `x: ±100%` enter/exit at 200ms on `var(--ease-out-strong)` (direction from the navigation), opacity 0→1 crossfade at 150ms under reduced motion; drag scale to 0.95 via `useTransform` (none under reduced motion); `finalFocus` = the current pearl's `MediaOpenButton` (found by `[data-pearl-button="<id>"]`); preloading: `new Image().src = url` for the two neighbours' originals when `currentId` changes; phones: `pb-[var(--bottom-inset)]`, `pt-[env(safe-area-inset-top)]`, the X and arrows 44px with the project's `pointer-coarse:` extensions.

- [ ] **Step 1: Unit tests** (`viewer-drag.test.ts`): `decideDrag({x: -90, y: 0}, {x: 0, y: 0}, "x") === "next"`; `({x: 50, y: 0}, {x: 450, y: 0}, "x") === "prev"`; `({x: 0, y: 85}, …, "y") === "close"` and `y: -85` too; `({x: 70, y: 0}, {x: 100, y: 0}, "x") === "none"`; no lock → `"none"`.
- [ ] **Step 2: e2e**: with three image pearls, open the first; `ArrowRight` → dialog name is the second, the status reads "2 of 3: Shot B", URL `pearl` replaced (history length unchanged); `ArrowRight` twice fast → ends on the third, status "3 of 3: Shot C" (Review Focus 4); `End`/`Home`; the "Next pearl" button is absent on the last; Esc closes and focus lands on the third card's button; under `reducedMotion: "reduce"` the viewer still opens and a video has no `autoplay` attribute; on the phone profile (`viewport 390x844, hasTouch, isMobile`): open, `page.goBack()` closes the viewer and stays on the page, and the arrow buttons measure ≥44px.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run the spec in both browsers → PASS; unit suite clean. By hand: swipe on a phone or the browser pane's touch emulation. **Step 6:** Commit `feat: navigate between pearls inside the viewer`.

### Task 8: `?pearl=` on load

**Files:**
- Modify: `src/lib/media-viewer-url.ts` (`useMediaViewerUrl` → `pendingId`), `src/components/home-shell.tsx`, `src/components/shared-folder-list.tsx`, `e2e/media-viewer.spec.ts`
- Test: `src/lib/media-viewer-url.test.ts`

**Interfaces:**
- Produces: on the owner's pages, when `pendingId` isn't in the registered list after the first load, `HomeShell` fetches `GET /api/links/${id}` (`parseJsonLinks([json])[0]`), and on 200 calls `mediaViewer.register([...items, link])` with the link appended and `mediaViewer.open(link.id, { standalone: true })` (no neighbours: `hasPrev`/`hasNext` false, no morph target so Cambio fades); on any other status it strips the param quietly (Review Focus 2). On the shared page an unknown id is stripped quietly.

- [ ] **Step 1: Unit test**: `useMediaViewerUrl`'s pure part: with items not containing the id, `pendingId` is the id; once registered, it opens and `pendingId` is null.
- [ ] **Step 2: e2e**: `page.goto("/home?pearl=<seeded image id>")` opens the dialog on it; `/home?pearl=nope` shows no dialog, no toast, and the URL loses the param; the shared page with `?pearl=<id in the first page>` opens on it.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS. **Step 6:** Commit `feat: open a pearl from the URL`.

### Task 9: Docs and verification

**Files:**
- Modify: `CLAUDE.md` (a "Media viewer" bullet set under Folders in the existing style: the store, the URL, the anchors and buttons per surface, the viewer's kinds, navigation and thresholds, reduced motion, phones, the shared page, the demo, the e2e spec; and in the "Media faces" bullet, replace "opening a media pearl opens its file in a new tab" with the viewer, and close the parked note about audio controls inside the shared card's link)

- [ ] **Step 1:** Write the bullets, verifying each claim against the code.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → clean; `pnpm test:e2e e2e/media-viewer.spec.ts e2e/media-links.spec.ts e2e/owner-grid.spec.ts e2e/shared-folders.spec.ts e2e/upload-entry-points.spec.ts` → pass (pre-existing failures aside).
- [ ] **Step 3:** Commit `docs: media viewer in CLAUDE.md`.

---

## Self-review notes

- Spec coverage: store (T2), URL (T3, T8), triggers and anchors per surface (T4 cards, T6 rows and shared), what morphs per kind and the playback hand-off (T5), the close target swap (T4), the viewer's layout, kinds, navigation, swipe, preloading, closing, live region, reduced motion, phones (T4, T5, T7), the shared page and the demo (T6: the demo renders no `MediaViewerLazy` because `DemoProvider` never registers), docs (T9). The spec's `Cambio.Title`/`Description` are in T4; `finalFocus` after navigation in T7.
- Names reused by name: `mediaViewer`, `useMediaViewer`, `useIsMediaOpen`, `MediaAnchor`, `MediaOpenButton`, `MediaViewerLazy`, `useMediaViewerUrl`, `decideDrag`, `AudioControls`.
- Review Focus tests sit in Tasks 2, 4, 5, 7 and 8.
