# Audio Now-Playing Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An audio pearl's card is a compact now-playing bar that morphs into the media viewer's opened player as one object, with playback continuing across the morph.

**Architecture:** The audio player store grows an `<audio>` element of its own (one per page) and a snapshot every view reads; the bar (`AudioBar`) and the opened player (`ViewerAudio`) are two views of it. The bar is the pearl's `MediaAnchor` (the box the viewer morphs from), and its sleeve, words and play button carry nested shared `layoutId`s so Motion carries each to its place in the player while Cambio morphs the box. Bencho's drawn play/pause mark comes across as `PlayMark`.

**Tech Stack:** Next.js 16, React 19, Motion (`m.*` under `LazyMotion`, features `domMax`), Cambio 1.1.5, Tailwind 4, Reicon, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-audio-now-playing-design.md`

## Global Constraints

- No new dependencies. No `lucide-react`; Reicon named imports only (`Export5` is the row menu's "Open file" icon; `Play`/`Pause` become `PlayMark`).
- Motion components are `m.*` inside `LazyMotion` with `loadMotionFeatures`; hooks are called unconditionally.
- Sizes are the spec's: `PAD` 10; sleeve 40 → 64, radius 6 → 12; play 30 → 46; side buttons 34; rail 3; gaps under the sleeve 22, under the rail 8, times 10 tall, under the times 16; bar height 78; player width `min(320px, 100vw - 32px)`, height 218; the card and the player box keep `MEDIA_RADIUS` (10).
- Names: "Play <title>" / "Pause <title>" with `aria-pressed`; "Seek <title>" with `aria-valuetext` "0:22 / 2:36"; "Restart <title>"; "Open file" (a link). Times `formatDuration`; remaining is `−` + `formatDuration(length − elapsed)` (U+2212).
- Text on the card's tint is `text-foreground/70` (the muted pair fails 4.5:1 at 12px in light mode).
- Touch targets: 44px through the project's `pointer-coarse:` pattern (the control drawn smaller plus an invisible `after:` extension).
- Reduced motion: Cambio's `reduced` preset for the box (already), no layout animation for the shared children, a 150ms opacity for the late elements, the mark swaps at once.
- Attribution: `src/components/play-mark.tsx` and `src/components/audio-bar.tsx` open with a comment naming Bencho's "Now playing" (bencho.dev) and the MIT licence; the source's explanatory comments stay where the code they explain stays.
- Commits: conventional subjects; `pnpm lint` and `pnpm typecheck` before each; e2e on the :3100 test server (`.env.e2e`), never the user's dev server; pre-existing failures not to chase: shared-folders "Share button labelled" (4), landing-demo (1). Never stage `AGENTS.md`.

## Review Focus

1. A file that fails to load (a 404 or a host that refuses): the mark returns to Play, the bar isn't stuck "Pause", the track is disabled, and nothing retries on its own. Pinned in Task 1 (store: `error` → idle, `failed`) and Task 3 (e2e: the aborted route).
2. Starting pearl B while A plays: A's bar shows Play with its run at 0 and B's run moves; one element, so no overlap is possible. Pinned in Task 1 (unit) and Task 3 (e2e, two cards).
3. A playing pearl whose last view leaves the page (deleted, moved out, the list emptied by a search): the sound stops; opening and closing the viewer (a second view) never stops it. Pinned in Task 1 (`attach` counting) and Task 4 (e2e: close keeps playing).
4. The phone grid (171px cards): the title truncates, the play button is a 44px target, the track is reachable, the `⋯` slot stays. Pinned in Task 3 (phone-profile e2e).
5. The hover preview's bar and the card's bar are two views of one pearl: pressing play in the preview moves the card's run too; closing the preview doesn't stop the sound. Pinned in Task 3 (e2e).

---

### Task 1: One `<audio>` element in the store

**Files:**
- Modify: `src/hooks/use-audio-player.ts` (rewrite), `src/components/media-card-face.tsx` (`AudioControls`: use the store's element, drop its own `<audio>`), `src/components/media-viewer.tsx:214-222` (the playback hand-off effect)
- Test: `src/hooks/use-audio-player.test.ts` (new), `e2e/media-viewer.spec.ts:557-610` (the hand-off test)

**Interfaces:**
- Consumes: nothing new.
- Produces (in `src/hooks/use-audio-player.ts`):
  ```ts
  export type AudioSnapshot = {
    id: string | null;        // the pearl loaded in the element (playing or paused), else null
    playing: boolean;
    elapsed: number;          // seconds
    length: number | null;    // seconds, once metadata is known
    failed: boolean;          // the last load errored; cleared by the next toggle
  };
  export type AudioElementLike = Pick<HTMLAudioElement, "play" | "pause" | "src" | "currentTime" | "duration" | "preload" | "addEventListener" | "removeEventListener">;
  export function createAudioPlayerStore(createElement: () => AudioElementLike): AudioPlayerStore;
  export const audioPlayerStore: AudioPlayerStore;   // createAudioPlayerStore(() => document.createElement("audio")), created lazily on first use in the browser
  interface AudioPlayerStore {
    subscribe(listener: () => void): () => void;
    getSnapshot(): AudioSnapshot;
    toggle(id: string, src: string): void; // another id (or none) loaded: load src, play from 0; this id playing: pause (id and elapsed kept); this id paused: resume
    stop(id: string): void;                // if id is loaded: pause, clear to idle (elapsed 0)
    seek(seconds: number): void;           // the loaded id only
    restart(): void;                       // seek(0) and keep playing or paused as it was
    attach(id: string): () => void;        // a view of id mounts; when the last view of the LOADED id detaches, stop(id)
  }
  export function useAudioPlayer(id: string, fallbackLength: number | null): {
    active: boolean;            // snapshot.id === id
    playing: boolean;           // active && snapshot.playing
    elapsed: number;            // active ? snapshot.elapsed : 0
    length: number | null;      // active && snapshot.length != null ? snapshot.length : fallbackLength
    failed: boolean;            // active && snapshot.failed
    toggle: (src: string) => void;
    seek: (seconds: number) => void;
    restart: () => void;
  };
  ```
  `useAudioPlayer` calls `attach(id)` in an effect (cleanup detaches). `viewerAudioId` is removed. Element events: `timeupdate` → `elapsed`; `loadedmetadata`/`durationchange` (finite, > 0) → `length`; `pause` (not from our own pause) → `playing: false`; `ended` → `stop(id)`; `error` → `failed: true` then `stop(id)` (so `failed` is readable by the view that pressed play: keep `failed` true on the idle snapshot until the next `toggle`). `play()` rejections other than `AbortError` count as `error`.

- [ ] **Step 1: Write the failing unit tests** in `src/hooks/use-audio-player.test.ts` with a fake element (a class with `play`/`pause` spies, settable `src`, `currentTime`, `duration`, and an `EventTarget` for events):
  - `toggle("a", "/a.mp3")` → element `src` is `/a.mp3`, `play` called, snapshot `{ id: "a", playing: true, elapsed: 0, length: null, failed: false }`.
  - `toggle("a", …)` again → `pause` called, `{ id: "a", playing: false }`, `elapsed` unchanged after a `timeupdate` at 12 (`currentTime` 12) → 12.
  - `toggle("b", "/b.mp3")` while "a" plays → `src` is `/b.mp3`, `currentTime` 0, `{ id: "b", playing: true, elapsed: 0 }`.
  - `loadedmetadata` with `duration` 156 → `length` 156; `duration` `Infinity` leaves `length` null.
  - `ended` → `{ id: null, playing: false, elapsed: 0 }`; `error` → `{ id: null, failed: true }`; the next `toggle` clears `failed`.
  - `seek(30)` → `currentTime` 30 and `elapsed` 30; `restart()` → 0 and `playing` unchanged.
  - `attach`: `const a1 = attach("a"); const a2 = attach("a"); toggle("a", …); a1(); ` → still playing; `a2()` → stopped; a detach of another id never stops.
  - `useAudioPlayer`: not a hook test (node env); the pure mapping is covered by a `snapshotFor(id, snapshot, fallbackLength)` export tested directly: inactive → `{ active: false, elapsed: 0, length: fallbackLength }`.
- [ ] **Step 2: Run** `pnpm vitest run src/hooks/use-audio-player.test.ts` → FAIL (`createAudioPlayerStore` is not a function).
- [ ] **Step 3: Implement** the store and hook per the Interfaces block. The element is created on the first `toggle` (never at module load: SSR). `preload = "none"`. Our own `pause()` calls set a flag so the `pause` event from them is ignored.
- [ ] **Step 4: Rewire `AudioControls`** (`media-card-face.tsx`): drop its `<audio>` and `audioRef`; `useAudioPlayer(size === "viewer" ? link.id : link.id, link.duration)` (one id now), `toggle(src)`, the range's `onChange` → `seek`, `disabled={!src || !length}`; keep its markup otherwise (Task 3 replaces it). In `media-viewer.tsx` delete the hand-off effect that called `audioPlayerStore.stop(currentId)` and `stop(viewerAudioId(...))`, and its imports.
- [ ] **Step 5: Update the e2e** `e2e/media-viewer.spec.ts` "an audio card opens the player at viewer size; the card's strip stops": rename to "…; playback continues in the viewer": press Play on the card, open the viewer, assert the dialog's Play button reads "Pause Song", and `page.evaluate(() => document.querySelectorAll("audio").length)` is 1; Esc → the card's button still reads "Pause Song".
- [ ] **Step 6: Run** `pnpm vitest run`, `pnpm typecheck`, `pnpm lint`, `pnpm test:e2e e2e/media-viewer.spec.ts e2e/media-links.spec.ts` (both engines) → PASS.
- [ ] **Step 7: Commit** `feat: one audio element for the page, playback continues into the viewer`.

### Task 2: The drawn play/pause mark

**Files:**
- Create: `src/components/play-mark.tsx`, `src/lib/play-mark-path.ts`
- Test: `src/lib/play-mark-path.test.ts`

**Interfaces:**
- Produces: `markPaths(t: number): { left: string; right: string }` in `src/lib/play-mark-path.ts` (pure; `t` 0 = pause, 1 = play; the eight points of each quad interpolated with Bencho's `PAUSE_L/PLAY_L/PAUSE_R/PLAY_R`, two decimals, `M…L…L…L…Z`), and `PlayMark({ playing, size, reducedMotion }: { playing: boolean; size: number; reducedMotion: boolean })` in `src/components/play-mark.tsx`: an `aria-hidden` `<svg viewBox="0 0 24 24">` with the two paths, `fill`/`stroke` `currentColor`, `strokeWidth` 2, round joins; `t` tweened over 300ms with the source's `SWING` ease by a rAF `useTween` (instant when `reducedMotion`); the goo (`sin(πt)`): `translate(±1.6·goo)` on the halves, `rotate((playing ? −9 : 9)·goo)` and `scale(1 − 0.13·goo, 1 + 0.11·goo)` on the svg, `transformOrigin` 50% 50%. Keep the source's comments on the goo, the winding and why the mark is drawn, not swapped.

- [ ] **Step 1: Write the failing tests** `src/lib/play-mark-path.test.ts`: `markPaths(0).left === "M6.00 4.00L10.00 4.00L10.00 20.00L6.00 20.00Z"`; `markPaths(1).right === "M13.25 8.00L20.00 12.00L20.00 12.00L13.25 16.00Z"`; `markPaths(0.5).left` starts with `"M6.25 4.00L11.63 6.00"`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/play-mark-path.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files (the component is not unit-tested; it is exercised by Task 3's e2e).
- [ ] **Step 4: Run** the test → PASS; `pnpm typecheck && pnpm lint` clean.
- [ ] **Step 5: Commit** `feat: drawn play/pause mark (from Bencho, MIT)`.

### Task 3: The bar

**Files:**
- Create: `src/components/audio-bar.tsx`
- Modify: `src/components/media-card-face.tsx` (delete `AudioFace`, `AudioControls`, `AUDIO_SIZES`; `AnchorIf` stays), `src/components/shared-link-card.tsx:36-60,118-123` (`SharedLinkCard` audio frame, `LinkCardContent` audio case), `src/components/link-card.tsx` (the audio card: no top-left checkbox, no top-right menu; both inside the bar), `src/components/link-preview.tsx:104-105`, `src/components/skeletons/pending-upload.tsx` (the audio pending card), `src/lib/link-kind.ts` only if `cardAspectRatio` is asked for audio anywhere (it must not be)
- Test: `e2e/media-links.spec.ts` (the audio assertions), `e2e/owner-grid.spec.ts` and `e2e/bulk-selection.spec.ts` if they touch the audio strip, `e2e/upload-entry-points.spec.ts` (the pending audio card, if asserted)

**Interfaces:**
- Consumes: `useAudioPlayer(id, fallbackLength)` (Task 1), `PlayMark` (Task 2), `MediaAnchor`/`AnchorIf` (`media-face-anchor.tsx`, `media-card-face.tsx`), `useIsSelectionActive`, `Checkbox`, `LinkMenu` (dynamic), `FolderBadge`/`useFolderTag` as `LinkCardStrip` uses them, `linkSecondLine`, `formatDuration`, `safeRemoteImgSrc`.
- Produces (in `audio-bar.tsx`):
  ```ts
  export const AUDIO_BAR = { pad: 10, height: 78, sleeve: 40, sleeveRadius: 6, play: 30, rail: 3 } as const;
  export function AudioBar(props: {
    link: Link;
    anchored?: boolean;        // the bar is the viewer's MediaAnchor (owner's card, shared card)
    owner?: {                  // the owner's card only: the checkbox in the sleeve slot, the menu slot after play
      selected: boolean;
      onToggleSelect: (opts: { shiftKey: boolean }) => void;
      menu: ReactNode;         // the card's <LinkMenu …> wrapped as the card does today (data-card-menu)
    };
    badge?: ReactNode;         // the folder badge on the sleeve's bottom-end corner
    compact?: boolean;         // the phone grid: the second line is just the length
    describedBy?: string;
  }): JSX.Element;
  export function AudioTrack(props: { link: Link; className?: string }): JSX.Element;
  // the rail + run + transparent range; used by the bar (at the foot) and by Task 4's player (under the words)
  export function AudioSleeve(props: { link: Link; size: 40 | 64; radius: 6 | 12; children?: ReactNode }): JSX.Element;
  // the thumbnail when `link.thumbnail`, else the Reicon music icon on `bg-muted`; `children` overlays (the checkbox, the badge)
  ```
  Markup rules: the bar is `data-face="audio"`, `relative flex h-[78px] items-center gap-2.5 p-[10px]` on `bg-card`; the words are a `min-w-0 flex-1` column (title `text-[13px] leading-4 font-medium truncate`, second line `text-[11px] leading-[14px] text-foreground/70`); play is a `<button>` 30px `rounded-full bg-foreground text-background` with `PlayMark size={12}`, `pointer-coarse:after:absolute pointer-coarse:after:-inset-[7px]` (44px); the menu slot is a 32px box after play, rendered only for `owner`, with the card's existing reveal rule (hover with a pointer, always on touch); the track is `absolute inset-x-[10px] bottom-[10px]`. Controls stop the card's click and are `inert` while selecting, exactly as `AudioControls` did (`data-card-menu` on the controls' wrapper, `preventDefault`/`stopPropagation`). The checkbox replaces the sleeve's content while selecting or on `group-hover/card` with a pointer (the row's pattern: `LinkItem`'s favicon/checkbox swap), keeping the sleeve box as its 40px hit area. The bar's root is what `AnchorIf` wraps; `corners="all"`.

- [ ] **Step 1: Write the failing e2e** in `e2e/media-links.spec.ts` (replace the strip assertions): on Home in grid view with a seeded audio upload "Song" (`duration` 156, a `thumbnail`-less upload) and an audio link "Birds" with a `thumbnail`: Song's card has no `[data-cy="link-card"] a` opener, shows "Song" and "Audio · 2:36" inside `[data-face="audio"]`, a `button[aria-label="Play Song"][aria-pressed="false"]`, a `[role="slider"][aria-label="Seek Song"]` (the range) and a music icon in the sleeve (`[data-sleeve="icon"]`); Birds' sleeve is an `<img>` (`[data-sleeve="image"]`); the card's height is 78 ± 1. Play (a routed silent WAV) → `aria-pressed="true"`, name "Pause Song", and after 1.5s the run (`[data-run]`) is wider than 0; pressing Play on Birds (a never-answering route) → Song's button reads "Play Song" again, its run width 0, Birds' button reads "Pause Birds" until the route is aborted, then "Play Birds" and `[role="slider"]` disabled (Review Focus 1, 2). Keyboard: focus the slider, `ArrowRight` → `aria-valuetext` changes. Phone profile (390×844, `hasTouch`, `isMobile`): the card is ≤ 175px wide, the title is truncated (`scrollWidth > clientWidth`), the second line reads "2:36", the Play target measures ≥ 44px with its `::after` (the project's way, see `bulk-selection.spec.ts`), the `⋯` is visible (Review Focus 4). Hover preview: in list view hover Song's row, the preview shows `[data-face="audio"]`; press its Play; the grid card (switch view) reads "Pause Song" (Review Focus 5); `document.querySelectorAll("audio").length === 1`. Selecting: with one card selected, a click on Song's bar (away from the controls) selects it; the Play button is inside `[inert]`; a click where Play sits lands on the card (keep the existing test's shape).
- [ ] **Step 2: Run** `pnpm test:e2e e2e/media-links.spec.ts --project=chromium` → FAIL.
- [ ] **Step 3: Implement** `audio-bar.tsx` per the Interfaces block; replace the audio branches in `LinkCardContent`, `SharedLinkCard` (the frame keeps the bar and the `MediaOpenButton` over the rest; the open button's `after:` overlay must not cover play, the track or the menu: the controls' wrapper is `relative z-[1] pointer-events-auto` as before), `LinkCard` (the owner's checkbox and menu move into the bar for audio: pass `owner`; the card's own top-left checkbox and top-right menu are not rendered for audio), `LinkPreviewBody` (the bar, no `owner`), and `PendingUploadCard` (for `kind === "audio"`: the bar's shape with `AudioSleeve` showing the icon, the file name as the title, "Uploading…" as the second line, the progress ring in the play slot). Delete `AudioFace`, `AudioControls`, `AUDIO_SIZES` and the now-unused imports. The landing demo gets the bar through `LinkCard` with `owner` undefined (no checkbox, no menu).
- [ ] **Step 4: Run** `pnpm test:e2e e2e/media-links.spec.ts e2e/owner-grid.spec.ts e2e/bulk-selection.spec.ts e2e/upload-entry-points.spec.ts e2e/media-viewer.spec.ts e2e/landing-demo.spec.ts` (both engines) → PASS (the landing-demo pre-existing failure aside); `pnpm vitest run`, `pnpm typecheck`, `pnpm lint` clean.
- [ ] **Step 5: Commit** `feat: audio pearls are a now-playing bar`.

### Task 4: The opened player

**Files:**
- Modify: `src/components/media-viewer-media.tsx` (`ViewerAudio`), `src/components/audio-bar.tsx` (export the sizes the player shares)
- Test: `e2e/media-viewer.spec.ts` (the audio viewer tests at ~557 and the arrows tests at ~983 and ~1286)

**Interfaces:**
- Consumes: `AudioSleeve`, `AudioTrack`, `useAudioPlayer`, `PlayMark`, `Export5` (Reicon), `formatDuration`, `linkSecondLine`.
- Produces: `ViewerAudio({ link, roomForArrows })` renders `data-viewer-media="audio"` as the spec's stack: width `min(320px, 100vw - 32px)`, `p-[10px]` (or `px-12` when `roomForArrows`), the sleeve row (`AudioSleeve size={64} radius={12}` + the words: title `text-[15.5px] leading-[19px] font-medium truncate`, second line `text-xs leading-[15px]`, `pr-9` for the X), `mt-[22px]` the `AudioTrack`, `mt-2` the times row (`text-[11px] leading-none tabular-nums text-foreground/70`: elapsed left, `−remaining` right; `0:00` and `−2:36` before metadata when `link.duration` is set, else the right side empty), `mt-4` the transport centred with `gap-3.5`: Restart (`<button>` 34px, "Restart <title>", Reicon `Restart`, outlined, `text-foreground/70`), Play (46px filled, `PlayMark size={18}`, "Play/Pause <title>", `aria-pressed`), Open file (`<a href={link.url} target="_blank" rel="noopener noreferrer">`, 34px, "Open file", `Export5`); the box ends `pb-[10px]`: 218px tall. Playback is the store's: opening a playing pearl shows "Pause" and the running elapsed; `Cambio.Title`/`Description` unchanged.

- [ ] **Step 1: Write the failing e2e** in `e2e/media-viewer.spec.ts`: open Song (silent WAV route) from the card after pressing its Play; the dialog holds `[data-viewer-media="audio"]` 320 ± 1 wide and 218 ± 2 tall, the title, "Audio · 2:36", a 64px sleeve (`[data-sleeve]` box), the slider "Seek Song", the times "0:0x" and "−2:3x", buttons "Restart Song", "Pause Song" (pressed) and a link "Open file" with `href` the pearl's url and `target="_blank"`; Restart → the elapsed text returns to "0:00" and the button stays "Pause Song"; Esc → the card's button reads "Pause Song" and `audio` elements are 1 (Review Focus 3). With neighbours (`seedAudioBetween`): the arrows don't intersect the slider or the transport (adapt the existing "arrows stay clear" tests to the new boxes). Reduced motion: the dialog opens and the mark has no transform transition (the `svg`'s inline `transform` is `rotate(0deg) scale(1, 1)` at once).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test:e2e e2e/media-viewer.spec.ts` (both engines) → PASS; unit, typecheck, lint clean. **Step 5: Commit** `feat: the viewer's audio player is the bar, opened`.

### Task 5: The sleeve, the words and the play travel

**Files:**
- Modify: `src/components/audio-bar.tsx` (`AudioSleeve`, the words, the play as `m.div`/`m.button` with `layoutId`s), `src/components/media-viewer-media.tsx` (`ViewerAudio`: the same ids; the late elements' entrance), `src/components/media-face-anchor.tsx` (export `pearlPartLayoutId(id, part)`)
- Test: `e2e/media-viewer.spec.ts`

**Interfaces:**
- Produces: `pearlPartLayoutId(id: string, part: "sleeve" | "words" | "play"): string` → `pearl-<id>-<part>`. In both the bar and the player: the sleeve, the words block and the play button are `m.*` elements with `layoutId={pearlPartLayoutId(link.id, part)}`, `layout` (true unless reduced motion), `layoutDependency` following the anchor's (`FACE_LAYOUT_DEPENDENCY` in the bar; in the player the Popup's current dependency, read from a tiny context the viewer provides, or the same constant if that proves equivalent: say which in the report), `layoutCrossfade={false}`, the sleeve with `borderRadius` set inline (6 / 12) so Motion corrects it; the `PlayMark` inside the play button keeps its own size per view (12 / 18: Motion scales the button, the mark swaps size at the end of the morph without a visible pop because the svg is `size-[40%]` of the button). The track, the times, Restart and Open file in the player are `m.div`s with `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}`, `transition={{ duration: 0.15, delay: reducedMotion ? 0 : 0.18 }}` (≈ 60% of the smooth preset's 300ms), and `exit` isn't needed (the Popup unmounts after the close morph). The bar's track fades with `data-pearl-morphing` (`opacity-0` while morphing, 150ms).

- [ ] **Step 1: Write the failing e2e**: open Song from its card with `reducedMotion: "no-preference"`; during the first 150ms after the click (ResizeObserver/rAF sampling as the existing morph tests do), the dialog's `[data-sleeve]` has an inline `transform` (Motion is carrying it) and its width grows monotonically from ≈ 40 toward 64; after the morph, `[data-sleeve]` measures 64 × 64 with no transform, the play button 46 × 46 and centred horizontally in the box (± 1), and the times/transport are visible (`opacity` 1). On Esc, the card's `[data-sleeve]` ends at 40 × 40 with no transform. Under `reducedMotion: "reduce"`: no `[data-sleeve]` transform ever appears and the dialog still ends in the same measurements.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test:e2e e2e/media-viewer.spec.ts e2e/media-links.spec.ts` (both engines) → PASS; unit, typecheck, lint clean. **Step 5: By hand** (the dev server, DevTools → Animations at 10%): the sleeve, the words and the play glide to their places inside the growing box with no stretch; the track and the transport arrive after the box has stopped growing; Esc runs it back. If the shared children stretch, flicker or follow the wrong lead, switch them to plain `layout` (no `layoutId`) and record it in the report. **Step 6: Commit** `feat: the bar's sleeve, words and play travel into the player`.

### Task 6: Docs and verification

**Files:**
- Modify: `CLAUDE.md` (the "Media faces" bullet's audio sentences; the "Media viewer" bullets' audio and playback sentences: one element in the store, no `viewerAudioId`, playback continues; a line on `PlayMark`/`audio-bar.tsx` and their MIT origin), `docs/superpowers/specs/2026-10-27-media-viewer-design.md` (the audio lines that said the viewer starts fresh, if any), `animation-plans/README.md` (a row: 002 is not a plan; note the bar landed through the spec instead)

- [ ] **Step 1:** Write the bullets, verifying each claim against the code.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm test && NEXT_DIST_DIR=.next-build pnpm build` → clean (restore `tsconfig.json`/`next-env.d.ts` if the build rewrites them; delete `.next-build`); `pnpm test:e2e e2e/media-viewer.spec.ts e2e/media-links.spec.ts e2e/owner-grid.spec.ts e2e/bulk-selection.spec.ts e2e/shared-folders.spec.ts e2e/upload-entry-points.spec.ts e2e/landing-demo.spec.ts` (both engines) → pass (pre-existing failures aside).
- [ ] **Step 3:** Commit `docs: the audio now-playing bar in CLAUDE.md`.

---

## Revision (2026-10-28): the player opens in place

The spec's amendment supersedes Tasks 4 and 5 (which landed as 0dd76f4, 8a150e1 and 150e6c6 and are taken back by Task 7) and Task 6 (redone as Task 10). Tasks 1–3 stand: the store, `PlayMark`, and the bar with the sleeve as its play control.

### Task 7: Audio leaves the viewer

**Files:**
- Modify: `src/lib/link-kind.ts` (`isViewerKind`: image and video; `isMediaKind` keeps audio for faces), `src/lib/media-viewer.ts` (`register` ignores audio; `useIsMediaMovedOff` removed), `src/components/home-shell.tsx` and `shared-folder-list.tsx` (register viewer kinds only), `src/components/media-viewer-media.tsx` (`ViewerAudio`, `DialogPresence` and the late parts removed; the `audio` case renders nothing), `src/components/media-viewer-nav.tsx` (`ViewerStage` back on `loadMotionFeatures`; `a[href]` out of `NOT_A_HANDLE`), `src/components/media-face-anchor.tsx` (`pearlPartLayoutId` removed), `src/components/audio-bar.tsx` (the shared-layout parts, the WAAPI words scale and `anchored` removed: the bar is plain markup again; `AnchorIf` no longer wraps it), `src/components/link-card.tsx`, `shared-link-card.tsx`, `link-item.tsx`, `shared-link-item.tsx` (audio no longer opens the viewer: no `MediaOpenButton` for audio; the card's opener for audio is Task 8's expand button), `e2e/media-viewer.spec.ts` (the audio viewer tests removed; a test that an audio pearl between two images is skipped by Previous/Next and that `?pearl=<audio id>` is stripped), `e2e/media-links.spec.ts` (selectors back to the plain bar).

**Interfaces:**
- Produces: `isViewerKind(kind: LinkKind): boolean` (image | video). `AudioBar`'s props lose `anchored`; everything else stays.

- [ ] **Step 1: e2e**: three pearls image A, audio S, image C: open A, ArrowRight → the dialog names C (S skipped), the status "2 of 2: C"; `/home?pearl=<S's id>` → no dialog, URL stripped. The audio tests in `e2e/media-viewer.spec.ts` that open S in the viewer are deleted. **Step 2:** Run → FAIL. **Step 3:** Implement (prefer deleting over keeping: `git show 0dd76f4 8a150e1 150e6c6` lists what came in). **Step 4:** Run `e2e/media-viewer.spec.ts`, `e2e/media-links.spec.ts` (both engines) → PASS; unit, typecheck, lint clean. **Step 5:** Commit `refactor: audio pearls leave the media viewer`.

### Task 8: The bar expands in place

**Files:**
- Create: `src/lib/audio-expansion.ts`, `src/lib/audio-expansion.test.ts`, `src/components/audio-player-tween.ts` (the `useTween` moved out of `play-mark.tsx` so both share it; or keep it where it is and export it: say which)
- Modify: `src/components/audio-bar.tsx` (the expansion), `src/components/play-mark.tsx` (import the shared tween), `e2e/media-links.spec.ts`

**Interfaces:**
- Produces: `audioExpansion` store: `openId: string | null`, `toggle(id)`, `close()`, `subscribe`, `getSnapshot`; `useAudioExpanded(id): { open: boolean; toggle: () => void; close: () => void }`. In `AudioBar`: `p = useTween(open ? 1 : 0, 460, reducedMotion, QUART)`; every size is `mix(a, b, p)` as the spec's amendment lists (height 78 → 189; sleeve 40 → 64, radius 6 → 12; words 13 → 15.5 and 11 → 12 with the block beside the sleeve at both ends; the track's top from 65 to 96; the times and the transport at opacity `late = clamp((p − 0.6) / 0.4, 0, 1)` with `pointer-events` only when `late > 0.9`; the sleeve's mark at opacity `1 − late`; on close only, `scale = 1 − 0.035 · sin(π · u^1.5)` with `u` a second, linear tween of the same length); the expand button (`data-expand`) is invisible and covers the whole bar when shut and the sleeve-and-words row when open, named "Expand <title>" / "Collapse <title>" with `aria-expanded`, declared before the controls so they win a press that lands on both; Esc on the card collapses; a trusted `pointerdown` outside the bar's root collapses, armed on the next tick after opening; opening one pearl closes another (the store). The opened layout is the one Task 4 built (Restart 34, Play 46 with `PlayMark 18`, Open file 34, the times, `gap-3.5`), now inside the card. The owner's checkbox and menu keep their places on the bar; while selecting the expand button is inert like the controls. Reduced motion: `p` jumps (instant), no swell, the late parts fade 150ms.

- [ ] **Step 1: Unit tests** (`audio-expansion.test.ts`): toggle opens, toggle again closes, toggling another id switches, `close()` clears, subscribers notified once per change.
- [ ] **Step 2: e2e** (`e2e/media-links.spec.ts`): in grid view with two audio pearls S and T and an image under them: click S's bar away from the controls → `[data-expand]` reads "Collapse S" with `aria-expanded="true"`, the bar's box grows to 189 ± 2 monotonically over the samples (ResizeObserver, as the viewer's resize tests sample), the image card below moves down by ≈ 111px, the transport's buttons are visible and clickable; click T's bar → S collapses to 78 and T opens; Esc → T collapses; open S then click the page background → S collapses; while S is open, play from its transport reads "Pause S" and S's sleeve shows no mark; `reducedMotion: "reduce"` → S opens at 189 at once (two samples apart ≤ 1 frame). Phone profile: a tap on the words opens; the expand button's target is the bar.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run `e2e/media-links.spec.ts`, `e2e/owner-grid.spec.ts`, `e2e/bulk-selection.spec.ts`, `e2e/upload-entry-points.spec.ts` (both engines) → PASS; unit, typecheck, lint clean. By hand on the dev server: the growth reads as one object; the cards below follow without a jump. **Step 6:** Commit `feat: the audio bar expands in place into the player`.

### Task 9: Rows, the shared page and the preview

**Files:**
- Modify: `src/components/link-item.tsx`, `shared-link-item.tsx` (an audio row renders `AudioBar` at the list's width, 78px, with the row's checkbox and menu conventions, and expands in place), `src/components/shared-link-card.tsx` (the shared card expands; the frame's open button is gone for audio), `src/components/link-preview.tsx` (the bar, not expandable: `expandable={false}`), `src/components/landing/*` only if the demo needs a prop, `e2e/link-row-phone.spec.ts`, `e2e/shared-folders.spec.ts`, `e2e/media-links.spec.ts`

**Interfaces:**
- Consumes: `AudioBar` (Task 8) with a new `expandable?: boolean` (default true) prop.

- [ ] **Step 1: e2e**: list view: an audio row shows the bar (78px) and expands to 189 on a click away from its controls; the row's checkbox and menu work as on other rows; shared page (signed-out): the audio card expands and plays inline, nothing opens a dialog, the URL never gains `pearl`; the hover preview's bar has no `[data-expand]`. **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the listed specs plus `e2e/media-viewer.spec.ts` (both engines) → PASS. **Step 5:** Commit `feat: audio rows and shared cards expand in place`.

### Task 11: The card's menu floats; rows keep the row layout (user correction after Task 9)

**Files:**
- Modify: `src/components/audio-bar.tsx` (drop the menu slot; the owner's `⋯` floats over the bar's top-right corner on hover with a pointer, always on touch, on a backing of the bar's surface, as `LinkCard` places its menu over a thumbnail; the words take the full width at rest; in the opened state the `⋯` keeps the corner), `src/components/link-card.tsx` (the audio card's menu as the other cards'), `src/components/link-item.tsx` and `shared-link-item.tsx` (an audio row is a normal row again: the icon slot with the checkbox swap, the title, `linkSecondLine`; the row's main element is a `<button>` "Play <title>" / "Pause <title>" that toggles playback through `useAudioPlayer`; while `active` a `PlayMark` button shows at the row's end beside the `⋯` (always, on the row's action backing) and the second line reads `${formatDuration(elapsed)} / ${formatDuration(length)}`; the row keeps its hover preview, `siblingsSelector` (the button), keyboard delete refocus, long-press, `select-none`; no expansion, no `--audio-swell`, no `my-1`), `src/components/link-group.tsx` and `shared-folder-list.tsx` (undo the 86px intrinsic size and the audio exclusions from the corner selectors: rows are 48/56px again), `src/lib/audio-expansion.ts` (unchanged), `CLAUDE.md` (the "Audio player" bullets' rows and menu sentences), `e2e/media-links.spec.ts`, `e2e/link-row-phone.spec.ts`, `e2e/shared-folders.spec.ts`, `e2e/bulk-selection.spec.ts`

- [ ] **Step 1: e2e**: grid: the bar's words span to the bar's padding at rest (no 32px gap before the end), the `⋯` is absent until hover with a pointer and present on the phone profile, hovering shows it over the top-right corner and the words stay put (no reflow); list: an audio row is 48px (56 on phones), shows the icon, the title and "Audio · 2:36", a click on the row toggles "Pause <title>", the row's end shows a `[data-row-play]` button while active, the second line reads "0:0x / 2:36", a second click pauses (the button stays while paused), Esc does nothing, the checkbox swap on hover and the `⋯` float as on other rows; shared list row: the same without the checkbox; phone: a tap on the row plays, long-press selects. **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the listed specs plus `e2e/owner-grid.spec.ts` (both engines) → PASS; unit, typecheck, lint clean. **Step 5:** Commit `feat: the audio card's menu floats; audio rows keep the row layout`.

### Task 10: Docs and verification

- [ ] As Task 6, written for the amended design: the "Audio player" bullets describe the in-place expansion (`audioExpansion`, the tween, the late parts, the swell, the masonry following, rows), the viewer bullets drop audio, "Media faces" is rewritten; `pnpm lint && pnpm typecheck && pnpm test && NEXT_DIST_DIR=.next-build pnpm build` and the e2e list in both engines. Commit `docs: the audio now-playing bar in CLAUDE.md`.

## Self-review notes

- Spec coverage: the bar (T3), the opened player (T4), the morph's shared elements and late arrivals (T5), the mark (T2), one element and continuity (T1), the pending audio card and the preview and the shared card and the demo (T3), rows unchanged (nothing), accessibility names and targets (T3, T4), reduced motion (T2, T4, T5), attribution (T2, T3), docs (T6), tests as the spec lists (T1 unit, T3–T5 e2e).
- Names reused by name: `useAudioPlayer`, `audioPlayerStore`, `createAudioPlayerStore`, `AudioSnapshot`, `PlayMark`, `markPaths`, `AudioBar`, `AudioTrack`, `AudioSleeve`, `AUDIO_BAR`, `pearlPartLayoutId`, `ViewerAudio`.
- Review Focus tests sit in Tasks 1, 3 and 4.
