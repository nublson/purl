# 001 — Resize the media viewer's box with the slide instead of snapping

- **Status**: DONE
- **Commit**: ad07708
- **Severity**: MEDIUM
- **Category**: 8. Missed opportunities (a state change that teleports) / 3. Physicality
- **Estimated scope**: 2 files (`src/components/media-viewer.tsx`, a new `src/components/media-viewer-resize.ts`), ~90 lines

## Problem

Moving between two pearls of different sizes inside the media viewer (ArrowRight, the arrow buttons, a swipe, Home/End) makes the dialog's box jump to the next pearl's size in one frame while the media slides across. The slide itself is animated, so the jump reads as a glitch in the middle of a motion. Trigger: open a landscape image, press `End` to reach a portrait one.

Why it snaps: the Popup is a Motion `layout` element (Cambio sets `layout: true` and `layoutId`), and the viewer pins its `layoutDependency` to a constant while open, on purpose, so that the open/close morph is the only layout animation it ever plays:

```tsx
/* src/components/media-viewer.tsx:258-263 — current */
          // Moving between pearls never morphs the box (it takes the new
          // pearl's size at once while the media slides).
          layoutDependency={
            closing && closing.step !== "ready" ? FACE_LAYOUT_DEPENDENCY : VIEWER_LAYOUT_DEPENDENCY
          }
          className="group/viewer z-50 w-max overflow-hidden bg-card outline-none data-closed:pointer-events-none"
```

The media slides inside the box with `AnimatePresence mode="popLayout"` (`src/components/media-viewer-nav.tsx:131-150`): the leaving slide is taken out of the flow, so the box is the new pearl's size from the first frame of the slide.

Why the fix is NOT "let Motion animate the layout" (`layoutDependency={currentId}`): Motion's layout animation scales the Popup with a transform, and the sliding media inside it is not a `layout` element, so it would be stretched for the duration (a 16:10 image squashed towards 3:4 while sliding). The honest motion here is a resize of the clipping box, with the media kept at its own size and centred, so the box reveals or clips it as it grows or shrinks. Animating `width`/`height` costs layout each frame, but the subtree is one image (or player) and three buttons, which is well within budget; this is a deliberate exception to "transform and opacity only" and the comment in the code must say so.

Cambio positions the Popup with CSS `translate: -50% -50%` from `top: 50%; left: 50%` (`node_modules/cambio/dist/es/index.mjs:353-357`), a separate property from `transform`, so an animated `width`/`height` keeps the box centred on its own: both edges move symmetrically.

## Target

On every move between pearls (not on open, not on close, never under reduced motion):

- The box animates from its current size to the next pearl's size over **200ms on `EASE_OUT_STRONG`** (`[0.23, 1, 0.32, 1]`, from `src/lib/motion.ts`), the same transition as the slide (`SLIDE_TRANSITION` in `src/components/media-viewer-nav.tsx:116`), so box and media arrive together as one motion.
- The media stays centred inside the box while it resizes (the Popup becomes a flex box centring its content; `overflow-hidden` already clips).
- A second move while a resize is running starts the next resize from the box's current animated size (interruptible), never from the previous target.
- Closing (Esc, X, swipe down, Back) cancels any running resize and clears the inline size before the close morph, so the morph measures the real box.
- Reduced motion: no resize animation (the box takes the new size at once, as today; the media crossfades).
- The Close button and the Previous/Next arrows are absolutely positioned on the box, so they ride its edges during the resize with no extra code; nothing else changes.

```tsx
/* src/components/media-viewer.tsx — target, the Popup */
        <Cambio.Popup
          key={layoutId}
          data-media-viewer=""
          ref={popupRef}
          …
          // Moving between pearls never morphs the box through Motion's
          // layout animation (that would stretch the sliding media); the
          // box resizes with the slide instead (`useBoxResize`).
          layoutDependency={
            closing && closing.step !== "ready" ? FACE_LAYOUT_DEPENDENCY : VIEWER_LAYOUT_DEPENDENCY
          }
          className="group/viewer z-50 flex w-max items-center justify-center overflow-hidden bg-card outline-none data-closed:pointer-events-none"
```

```ts
/* src/components/media-viewer-resize.ts — target, whole file */
"use client";

import { EASE_OUT_STRONG } from "@/lib/motion";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/** The box resizes with the slide: the same length and curve. */
const RESIZE_TRANSITION = { duration: 0.2, ease: EASE_OUT_STRONG };

/**
 * Resizes the viewer's box from the pearl it showed to the one it moves to,
 * instead of letting it snap: `capture()` reads the box right before the
 * move is applied, and the layout effect after the move animates the box's
 * width and height from that size to the new pearl's, then clears them so
 * the box follows its content again. Width and height are animated on
 * purpose (a transform would stretch the sliding media); the subtree is
 * one image or player and three buttons. Nothing under reduced motion.
 */
export function useBoxResize(
  box: RefObject<HTMLElement | null>,
  currentId: string | null,
  reducedMotion: boolean,
) {
  const from = useRef<{ width: number; height: number } | null>(null);
  const running = useRef<AnimationPlaybackControls | null>(null);

  /** Stops a running resize and lets the box follow its content. */
  const cancel = useCallback(() => {
    running.current?.stop();
    running.current = null;
    from.current = null;
    const el = box.current;
    if (el) {
      el.style.width = "";
      el.style.height = "";
    }
  }, [box]);

  /** Reads the box as it is now (mid-resize included), right before a move. */
  const capture = useCallback(() => {
    const el = box.current;
    if (!el || reducedMotion) return;
    const rect = el.getBoundingClientRect();
    from.current = { width: rect.width, height: rect.height };
    // The box must follow its content for the new size to be measured.
    running.current?.stop();
    running.current = null;
    el.style.width = "";
    el.style.height = "";
  }, [box, reducedMotion]);

  useLayoutEffect(() => {
    const el = box.current;
    const start = from.current;
    from.current = null;
    if (!el || !start || currentId === null) return;
    const rect = el.getBoundingClientRect();
    const to = { width: rect.width, height: rect.height };
    if (Math.abs(to.width - start.width) < 1 && Math.abs(to.height - start.height) < 1) return;
    running.current = animate(
      el,
      { width: [`${start.width}px`, `${to.width}px`], height: [`${start.height}px`, `${to.height}px`] },
      RESIZE_TRANSITION,
    );
    running.current.then(() => {
      // Only the resize that finished clears the size; a newer one owns it.
      if (running.current === null) return;
      running.current = null;
      el.style.width = "";
      el.style.height = "";
    });
  }, [box, currentId]);

  useLayoutEffect(() => cancel, [cancel]);

  return { capture, cancel };
}
```

## Repo conventions to follow

- Easing and durations: `EASE_OUT_STRONG` in `src/lib/motion.ts` is the project's one strong ease-out (`--ease-out-strong` in `src/app/globals.css`); the slide already uses it at 200ms (`SLIDE_TRANSITION`, `src/components/media-viewer-nav.tsx:116`). Reuse both; add no new token.
- Imperative Motion animation on a DOM element: `animate(pull, 0, { duration: 0.2, ease: EASE_OUT_STRONG })` in `src/components/media-viewer-nav.tsx:231` imports `animate` from `motion/react`; do the same (the viewer's chunk is lazy-loaded, so the import costs nothing on first load).
- Reduced motion: the viewer reads `usePrefersReducedMotion()` once in `media-viewer.tsx:75` and passes the boolean down; take it as a parameter, don't read it again.
- Comments in this codebase say why, in plain sentences; keep the one in the target above.
- Hooks are called unconditionally; `"use client"` at the top of client modules; Reicon icons only (none needed here).

## Steps

1. Create `src/components/media-viewer-resize.ts` with the target code above, verbatim.
2. In `src/components/media-viewer.tsx`, import it: `import { useBoxResize } from "./media-viewer-resize";` and, after `const popupRef = useRef<HTMLDivElement>(null);` (line 161) and the `closed` constant, add:
   ```ts
   const boxResize = useBoxResize(popupRef, currentId, reducedMotion);
   ```
   (`currentId` and `reducedMotion` already exist in scope.)
3. In `move` (`media-viewer.tsx:191-202`), call `boxResize.capture()` right before `mediaViewer[to]();` (after the focus hand-off, so the capture is the last thing before the store update).
4. In `requestClose` (`media-viewer.tsx:86-95`), call `boxResize.cancel()` as its first statement, so the close morph measures the real box. Since `requestClose` is a `useCallback` with `[]` deps, add `boxResize.cancel` to its dependency array (it is stable: `useCallback` with `[box]`). Keep the `useEffect(() => mediaViewer.setCloseRequest(requestClose), [requestClose])` as is.
5. On the Popup's `className` (`media-viewer.tsx:264`), add `flex items-center justify-center` so the content stays centred while the box is wider or taller than it. The static layout doesn't change: `w-max` keeps the box the content's size when no inline size is set.
6. Replace the comment above `layoutDependency` (`media-viewer.tsx:258-259`) with the target's three-line comment.
7. In `CLAUDE.md`'s "Media viewer" bullets, change the sentence that says the box snaps between pearls of different sizes to: the box resizes with the slide (200ms on `EASE_OUT_STRONG`, width/height on purpose: a transform would stretch the sliding media; `useBoxResize` in `media-viewer-resize.ts`; not under reduced motion). In `docs/superpowers/specs/2026-10-27-media-viewer-design.md`, remove the Deviations line about the box snapping.
8. Add an e2e in `e2e/media-viewer.spec.ts` next to the existing navigation tests: seed two image pearls of clearly different sizes (one 800×500, one 500×800, both `icon.png` sources as the existing seeds do), open the first, press `End`, and sample the dialog's `getBoundingClientRect()` height on each animation frame for 8 frames: assert the heights are non-decreasing (growing towards the portrait pearl's) and that the first sampled height is strictly less than the last; then after `expect(dialog).toHaveCSS("width", …)` is not needed: assert that within 500ms `dialog.evaluate(el => el.style.width)` is `""` (the inline size cleared). Under `reducedMotion: "reduce"`, the same move leaves `el.style.width` `""` on every frame (no resize animation).

## Boundaries

- Do NOT touch `src/components/media-viewer-nav.tsx` (the slide, the arrows, the drag) or `media-viewer-media.tsx`.
- Do NOT change `layoutDependency`'s values or the `Closing` steps; the open/close morph stays exactly as it is.
- Do NOT add a new easing or duration; reuse `EASE_OUT_STRONG` and 200ms.
- Do NOT add dependencies.
- If a cited line doesn't match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` (clean), `pnpm lint` (0 errors), `pnpm vitest run` (all pass), `pnpm test:e2e e2e/media-viewer.spec.ts` in Chromium and WebKit (all pass, the new ones included).
- **Feel check** (the dev server; a page with a landscape and a portrait image pearl, e.g. seed two uploads):
  - Open the landscape pearl, press `End`: the box grows into the portrait shape over the same 200ms the media slides in; the Close button and the arrows ride the edges; nothing stretches.
  - Press `Home` right after: the box shrinks back, starting from wherever it was (press twice fast: no jump to a stale size, no flicker).
  - In DevTools → Animations, set playback to 10% and confirm the image is never squashed and stays centred while the box clips it.
  - Esc mid-resize: the close morph plays into the card without a visible size jump larger than the resize's remaining distance.
  - Rendering panel → emulate `prefers-reduced-motion: reduce`: the box changes size at once while the media crossfades; no width/height animation.
- **Done when**: the e2e passes in both engines, the feel check shows one continuous motion between pearls of different sizes, and `CLAUDE.md` plus the spec's Deviations section no longer say the box snaps.
