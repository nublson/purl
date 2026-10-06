# Haptic Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Haptic feedback on touch devices (iOS and Android) for toggles, selection and commit actions.

**Architecture:** Two pieces used together at each moment. `haptic(kind)` (`src/lib/haptics.ts`) vibrates on Android from the tap's handler. `<HapticTarget />` (`src/components/haptic-target.tsx`) lays an invisible `<label>` wired to a hidden native `<input type="checkbox" switch>` over the tapped element, so iOS Safari plays its switch tick on the tap's release. It is pass-through by default, or owns the tap (`onTap`) where the element's handlers call `preventDefault()`.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, Radix UI, Vitest, Playwright (Chromium + WebKit).

**Spec:** `docs/superpowers/specs/2026-10-06-haptic-feedback-design.md`

## Global Constraints

- Kinds and patterns (ms): `selection` `[10]`; `success` `[10, 60, 10]`; `warning` `[25, 60, 25]`.
- `haptic()` vibrates only when `navigator.vibrate` exists and `matchMedia("(pointer: coarse)")` matches; never throws.
- `<HapticTarget />` renders only on touch screens via the CSS `pointer-coarse:` variant (no JS detection, no hydration mismatch), is `aria-hidden`, and its switch has `tabIndex={-1}`.
- The switch is never under the finger: `absolute size-px m-0 invisible`. The label is `absolute inset-0`, `touch-manipulation`, `[-webkit-tap-highlight-color:transparent]`.
- No in-app setting, no `ios-haptics` dependency. Credit ios-haptics (MIT) in a comment.
- Call `haptic()` in tap handlers (`onClick` / `onSelect` / `onCheckedChange` at the call site), never inside functions shared with keyboard shortcuts (`toggleAll`, `deleteSelected`, `moveTo`, `toggleReadSelected`).
- No haptics after network responses, on link open, on menu open, on folder switch, or on clearing the selection.
- Repo rules: named imports only from `@radix-ui/*` and the icon library; match the surrounding comment style (why, not what).

## Review Focus

1. **Double actions.** The label forwards a second click to the switch; if it reaches the element, Mark read sends two requests or Delete makes two toasts. Expected: exactly one action per tap (Tasks 3, 7, 8 assert request and toast counts).
2. **Disabled controls.** A label inside a disabled button or a `data-disabled` menu item could still flip its switch (an iOS tick for a tap that does nothing). Expected: no flip and no vibration (Task 2 hides the target there; Task 8 tests the disabled Copy link and the current folder in Move).
3. **Links still open.** A row or card tapped while not selecting must open its link: no overlay is mounted then. Expected: a popup opens and no switch exists in the row (Tasks 5, 6).
4. **Scrolling from a target.** A touch drag that starts on a selecting row (fully covered by the owner overlay) must still scroll the list. Expected: `scrollY` grows (Task 5, Chromium-only CDP gesture).
5. **Desktop unchanged.** With a mouse, no haptic label is visible or hit-testable, Tab order and accessible names don't change, and `vibrate` is never called (Task 3 runs the desktop checks once for the shared component).

## Shared e2e helpers (defined in Task 3, used by Tasks 3–8)

In `e2e/haptics.spec.ts`:

- `const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }`, used with `test.use(phone)` in touch describes.
- `stubVibrate(page: Page): Promise<void>`: `page.addInitScript` defining `navigator.vibrate = (p) => { (window.__vibrations ??= []).push(Array.isArray(p) ? p : [p]); return true; }`.
- `vibrations(page: Page): Promise<number[][]>`: reads `window.__vibrations ?? []`.
- `hapticSwitch(scope: Locator): Locator`: `scope.locator("[data-haptic-target] input[type=checkbox]").first()`.
- `expectTick(scope: Locator, act: () => Promise<void>)`: reads `hapticSwitch(scope)`'s `checked` (via `evaluate`), runs `act`, then `expect.poll` until `checked` has flipped. This is the CI proxy for an iOS tick.

---

### Task 1: iOS feasibility probe (throwaway)

Answers the spec's open questions before building on them. The output is a recorded answer; the probe file is deleted.

**Files:**
- Create (then delete): `public/haptics-probe.html`
- Modify: `docs/superpowers/specs/2026-10-06-haptic-feedback-design.md` (record results)

- [ ] **Step 1: Write the probe page.** Plain HTML and JS, no app code. Three cases, each with a visible counter of the hidden switch's `change` events:
  - A. A pass-through label in a button whose click handler removes the button from the DOM (`button.remove()`) synchronously, then on `queueMicrotask`. This simulates a Radix menu item closing its menu.
  - B. A div with a 500ms long-press timer (`pointerdown`/`pointerup`, like `useLongPress`). When the timer fires it appends an owner label (inset 0) over the div; the label's `onclick` counts and calls `event.stopPropagation()`.
  - C. A tall scrolling list of divs, each fully covered by a label. Show `scrollY`.
- [ ] **Step 2: Run it in the iOS Simulator's Safari.** Start the dev server with the `purl-dev` launch config (autoPort) and open `http://localhost:<port>/haptics-probe.html` with `xcrun simctl openurl booted <url>` (use `localhost`, not `127.0.0.1`). Tap A (both variants); long-press B for about 1s and lift; drag on C.
- [ ] **Step 3: Record the results.** Screenshot after each case (`xcrun simctl io booted screenshot`). Pass criteria: A's counter goes up for both variants; B's counter goes up once after the lift; C's `scrollY` grows.
- [ ] **Step 4: Apply the fallbacks, as spec edits, before Task 2.**
  - If B fails, long-press is Android-only (Tasks 5 and 6 skip the long-press overlay assertion on iOS and keep `haptic()`).
  - If A fails only for the synchronous removal, it doesn't matter: React and Radix close menus asynchronously.
  - If A fails for both, menu items are Android-only on iOS. Stop and ask the user before continuing, since that changes the spec's table.
  - If C fails, stop and ask.
- [ ] **Step 5: Delete the probe and commit the spec update.**

```bash
rm public/haptics-probe.html
git add docs/superpowers/specs/2026-10-06-haptic-feedback-design.md
git commit -m "docs(spec): record the iOS haptics probe results"
```

### Task 2: `haptic()` and `<HapticTarget />`

**Files:**
- Create: `src/lib/haptics.ts`, `src/lib/haptics.test.ts`, `src/components/haptic-target.tsx`

**Interfaces:**
- Produces:
  - `export type HapticKind = "selection" | "success" | "warning"`
  - `export const HAPTIC_PATTERNS: Record<HapticKind, number[]>` (values from Global Constraints)
  - `export function haptic(kind: HapticKind): void`
  - `export function HapticTarget(props: { onTap?: (event: React.MouseEvent<HTMLLabelElement>) => void; className?: string }): JSX.Element`. The parent must be positioned (`relative` or `absolute`).

- [ ] **Step 1: Write the failing unit tests** in `src/lib/haptics.test.ts` (node env; stub `globalThis.navigator` and `globalThis.matchMedia` with `vi.stubGlobal`, and restore them in `afterEach`):
  - `it.each(["selection", "success", "warning"])("%s vibrates its pattern on a touch screen")`: `vibrate` is called once with `HAPTIC_PATTERNS[kind]`.
  - `"does nothing with a mouse"`: `matchMedia` returns `{ matches: false }`, so `vibrate` isn't called.
  - `"does nothing without vibrate (iOS)"`: a navigator without `vibrate` doesn't throw.
  - `"does nothing on the server"`: with `navigator` undefined, it doesn't throw.
  - `"swallows a throwing vibrate"`: `vibrate` throws, and `haptic("selection")` doesn't.
  - `HAPTIC_PATTERNS` equals `{ selection: [10], success: [10, 60, 10], warning: [25, 60, 25] }`.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm vitest run src/lib/haptics.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `haptic(kind)`** in `src/lib/haptics.ts`, wrapped in try/catch. Its doc comment explains why it gates on a coarse pointer (desktop Chrome has a no-op `vibrate`).
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Implement `HapticTarget`** in `src/components/haptic-target.tsx` (`"use client"`):
  - The label carries `data-haptic-target`, `aria-hidden`, and the classes from Global Constraints. It is `hidden pointer-coarse:block`, plus `in-disabled:hidden in-data-disabled:hidden` so it disappears inside disabled controls (Review Focus 2).
  - The label's `onClick`: with `onTap`, call `event.stopPropagation()` and then `onTap(event)`. Never call `preventDefault()` (it would cancel the tick).
  - The switch: `<input type="checkbox" switch="" tabIndex={-1}>`. React 19 passes the unknown `switch` attribute through; if TypeScript rejects it, spread `{ switch: "" } as Record<string, string>`. Its `onClick={(e) => e.stopPropagation()}` stops the forwarded click.
  - Its comment credits ios-haptics (MIT), explains the switch-never-under-the-finger rule (scrolling), and the owner versus pass-through rule.
- [ ] **Step 6: Typecheck and lint.** Run: `pnpm typecheck && pnpm exec eslint src/lib/haptics.ts src/components/haptic-target.tsx`. Expected: no errors.
- [ ] **Step 7: Commit.**

```bash
git add src/lib/haptics.ts src/lib/haptics.test.ts src/components/haptic-target.tsx
git commit -m "feat(haptics): haptic() for Android and HapticTarget for iOS"
```

### Task 3: Switches (and the shared e2e helpers)

**Files:**
- Modify: `src/components/ui/switch.tsx`
- Create: `e2e/haptics.spec.ts` (the helpers above, plus this task's tests)

**Interfaces:**
- Consumes: `haptic`, `HapticTarget` (Task 2).
- Produces: the e2e helpers listed under "Shared e2e helpers".

- [ ] **Step 1: Write the failing e2e tests** in a `test.describe("Haptics: switches")` with `test.use(phone)` and `stubVibrate` in `beforeEach`:
  - `"the Public switch ticks, vibrates once and still saves"`: seed a folder, open the folder page, open the Share popover, then `expectTick(switchLocator, tap)`. The folder becomes public (the copy button is enabled), `vibrations` equals `[[10]]`, and exactly one `PATCH /api/folders/*` was sent (count with `page.on("request")`).
- [ ] **Step 2: Write the desktop tests** in `test.describe("Haptics: desktop")` with no touch:
  - `"no haptic target is visible"`: on Home with seeded links, the folder page and its Share popover open, `[data-haptic-target]` has zero visible elements (`toBeHidden()` for each).
  - `"clicking the switch never vibrates"`: click the Public switch with the mouse; `vibrations` equals `[]`.
  - `"Tab order and names are unchanged"`: with the Share popover open, press Tab and read `document.activeElement`'s accessible name for each stop. The stops are the Public switch, then the copy button, with no unnamed stop in between.
- [ ] **Step 3: Run them and see them fail.** Run: `pnpm exec playwright test e2e/haptics.spec.ts --project=chromium`. Expected: the touch test fails (no `[data-haptic-target]`); the desktop tests pass.
- [ ] **Step 4: Wire `ui/switch.tsx`.** Render `<HapticTarget />` inside `SwitchPrimitive.Root` after the Thumb, and wrap `onCheckedChange` to call `haptic("selection")` before the caller's handler. The Root is already `relative`.
- [ ] **Step 5: Run the tests in both browsers.** Run: `pnpm exec playwright test e2e/haptics.spec.ts e2e/shared-folders.spec.ts`. Expected: all pass, Chromium and WebKit.
- [ ] **Step 6: Commit.**

```bash
git add src/components/ui/switch.tsx e2e/haptics.spec.ts
git commit -m "feat(haptics): switches tick on touch screens"
```

### Task 4: Folder tags (user menu)

**Files:**
- Modify: `src/components/view-mode-menu.tsx` (`FolderTagsMenuItem`)
- Test: `e2e/haptics.spec.ts`

- [ ] **Step 1: Write the failing test** `"Folder tags ticks, vibrates once and saves"` (touch): open the Account menu, then `expectTick` on the `menuitemcheckbox` "Folder tags". Expect one `PATCH /api/user/layout` with `{ folderTags: true }`, `vibrations` equal to `[[10]]`, and the menu still open (the item keeps it open).
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.** Put `<HapticTarget />` inside the `DropdownMenuCheckboxItem` (already `relative`). Call `haptic("selection")` in its `onCheckedChange` before `setFolderTags`.
- [ ] **Step 4: Run the test and `e2e/owner-grid.spec.ts`.** Expected: PASS in both browsers.
- [ ] **Step 5: Commit** with the message `feat(haptics): folder tags toggle ticks`.

### Task 5: Rows: long-press, tapping while selecting, the checkbox

**Files:**
- Modify: `src/components/link-item.tsx`
- Test: `e2e/haptics.spec.ts`

**Interfaces:**
- Consumes: `HapticTarget` `onTap`, `haptic`.

- [ ] **Step 1: Write the failing tests** (touch, Home with 3 seeded links):
  - `"a long-press selects the row and vibrates"`: a touch long-press on row 1 (dispatch `touchstart` then `touchend` after 700ms with CDP `Input.dispatchTouchEvent`; Chromium only). Row 1 is selected and `vibrations` equals `[[10]]`. On WebKit, assert only that the row is selected (`test.skip` the vibration part).
  - `"while selecting, a tap toggles the row and ticks"`: select row 1 by its checkbox, then `expectTick(row 2, () => row2.tap())`. Row 2 is selected, the selection count is 2, and no popup opened.
  - `"the checkbox ticks"`: `expectTick(row 1's checkbox wrapper, tap checkbox)`. Row 1 is selected and `vibrations` ends with `[10]`.
  - `"not selecting, a tap opens the link and nothing ticks"` (Review Focus 3): row 1 has no `[data-haptic-target]` outside its checkbox wrapper, a tap opens a popup, and `vibrations` equals `[]`.
  - `"a drag that starts on a selecting row scrolls"` (Review Focus 4, Chromium only): seed 40 links, select one, then use CDP `Input.synthesizeScrollGesture` from the middle of row 5 with `yDistance: -400`. `window.scrollY` grows (or the list's scroll container does, if the page doesn't scroll).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - In the long-press timer callback, after `linkSelection.toggle(...)`, call `haptic("selection")`.
  - While `selecting`, render `<HapticTarget className="z-[5]" onTap={...} />` as the last child of `Item`. The handler: if `longPressedRef.current`, reset it and return (the long-press already selected the row: tick only). Otherwise call `haptic("selection")` and `linkSelection.toggle(link.id, { shiftKey: event.shiftKey })`.
  - Inside the row's `Checkbox`, render `<HapticTarget onTap={...} />` with the same body as the checkbox's existing `onClick` (keep that `onClick` for mouse and keyboard; the overlay stops propagation, so it doesn't run twice), plus `haptic("selection")` when it toggles.
  - The z-index sits above the row link and below the checkbox (`z-10`).
- [ ] **Step 4: Run the tests plus `e2e/bulk-selection.spec.ts` and `e2e/link-row-phone.spec.ts`.** Expected: PASS in both browsers.
- [ ] **Step 5: Commit** with the message `feat(haptics): rows tick on long-press, selection taps and the checkbox`.

### Task 6: Cards: same as rows

**Files:**
- Modify: `src/components/link-card.tsx`
- Test: `e2e/haptics.spec.ts`

- [ ] **Step 1: Write the failing tests:** Task 5's first four tests, in grid view (`PATCH /api/user/layout { view: "grid" }` before `goto`), targeting `[data-cy="link-card"]`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - Call `haptic("selection")` in the `useLongPress` callback.
  - While selecting, render `<HapticTarget className="z-[5]" onTap={...} />` (the card root is `relative`; the link is `z-0`, the checkbox and menu `z-10`). The handler: if `consumeLongPress()`, return. Otherwise call `haptic("selection")` and toggle.
  - Inside the card's `Checkbox`, add the same owner overlay as in Task 5.
- [ ] **Step 4: Run the tests plus `e2e/owner-grid.spec.ts`.** Expected: PASS in both browsers.
- [ ] **Step 5: Commit** with the message `feat(haptics): cards tick like rows`.

### Task 7: The selection bar

**Files:**
- Modify: `src/components/link-selection-bar.tsx`
- Test: `e2e/haptics.spec.ts`

- [ ] **Step 1: Write the failing tests** (touch, 3 links, one selected by its checkbox, then reset `window.__vibrations = []`):
  - `"Select all ticks"`: after `expectTick` on "Select all", the count is 3 and `vibrations` equals `[[10]]`.
  - `"Mark as read ticks once"` (Review Focus 1): after `expectTick`, exactly one `PATCH /api/links/bulk` with `read: true` was sent and `vibrations` equals `[[10, 60, 10]]`.
  - `"Delete ticks once with a warning"`: after `expectTick`, one Undo toast and `vibrations` equals `[[25, 60, 25]]`.
  - `"Move into a folder ticks once"`: seed a folder, then open Move and `expectTick` on the folder's item. One `PATCH /api/links/bulk` with that `folderId` and `vibrations` equals `[[10, 60, 10]]`. Repeat for "Remove from …" and "New folder…" (the latter ticks; its dialog opens).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - Add `<HapticTarget />` inside the Select all, Mark read and Delete `Button`s. Add `relative` where `TOUCH_TARGET` / `TOUCH_ICON_TARGET` don't already provide it.
  - Make each `onClick` an inline call: `haptic(kind)` followed by the existing function (`toggleAll` / `toggleReadSelected` / `deleteSelected`, unchanged, since the keyboard shortcuts use them).
  - In `MoveMenu`, add `<HapticTarget />` inside each `FolderRow` item and inside the "Remove from …" and "New folder…" items, with `haptic("success")` in their `onSelect`.
- [ ] **Step 4: Run the tests plus `e2e/bulk-selection.spec.ts` and `e2e/reading-state.spec.ts`.** Expected: PASS in both browsers.
- [ ] **Step 5: Commit** with the message `feat(haptics): selection bar actions tick`.

### Task 8: The row menu and Copy link

**Files:**
- Modify: `src/components/link-menu.tsx`, `src/components/link-folder-submenu.tsx`, `src/components/folder-share-popover.tsx`
- Test: `e2e/haptics.spec.ts`

- [ ] **Step 1: Write the failing tests** (touch; open a row's `⋯` menu with "Open link menu"):
  - `"Mark as read ticks once"`: one `PATCH /api/links/*` and `vibrations` equals `[[10, 60, 10]]`.
  - `"Delete ticks once with a warning"`: one Undo toast and `[[25, 60, 25]]`.
  - `"Move to folder ticks"`: expand "Move to folder" in place (phones), then tick a folder. One move request and `[[10, 60, 10]]`. "Move to folder" itself (expanding) doesn't tick: `vibrations` stays `[]` before the folder tap.
  - `"the current folder doesn't tick"` (Review Focus 2): on a folder page, the current folder's item is disabled; tapping it doesn't flip any switch and `vibrations` equals `[]`.
  - `"Copy link ticks once it's public; not while private"` (Review Focus 2): with the folder private, tapping the disabled copy button flips nothing and doesn't vibrate. After making it public (reset `__vibrations`), `expectTick` on copy shows "Link copied" and `[[10, 60, 10]]`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - `link-menu.tsx`: add `<HapticTarget />` inside the Mark read and Delete items, with `haptic("success")` / `haptic("warning")` in their handlers.
  - `link-folder-submenu.tsx`: add `<HapticTarget />` inside each folder item and the "Remove from …" item, in both the phone (in place) and desktop (submenu) renderings, with `haptic("success")` in `onSelect`. Not on the "Move to folder" toggle.
  - `folder-share-popover.tsx`: add `<HapticTarget />` inside the copy `Button` (already `relative`), with `haptic("success")` in its `onClick` before `copyLink()`.
- [ ] **Step 4: Run the tests plus `e2e/shared-folders.spec.ts` and `e2e/link-management.spec.ts`.** Expected: PASS in both browsers.
- [ ] **Step 5: Commit** with the message `feat(haptics): row menu actions and Copy link tick`.

### Task 9: Docs, full verification, device checklist

**Files:**
- Modify: `CLAUDE.md` (a **Haptics** bullet under Folders, or a short section next to the iOS gotchas)

- [ ] **Step 1: Document it in `CLAUDE.md`.** Cover the two pieces and their files, pass-through versus owner (`onTap`, never `preventDefault`), the pattern values, where haptics are used and deliberately not, why there's no async or long-press tick on iOS (if Task 1 said so), and `e2e/haptics.spec.ts` with its switch-flip proxy.
- [ ] **Step 2: Run the full checks.** Run: `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm exec playwright test` (all specs, both browsers). Expected: all pass; lint shows no new warnings.
- [ ] **Step 3: Recheck in the iOS Simulator** on the real app (sign in by cookie, as the e2e fixtures do). Tap one item from each group and confirm through Safari's Web Inspector, or a temporary console log, that the switches flip. Take screenshots.
- [ ] **Step 4: Commit** with the message `docs: haptic feedback`, then open the PR against `develop` with the device checklist in its body:
  - iPhone: Public switch, Folder tags, long-press a row and a card, tap rows while selecting, Select all, bar Mark read, Move, Delete, row menu Mark read, Move, Delete, Copy link.
  - The same on Android Chrome; Delete should feel firmer than Move.
  - Scroll the list while selecting; tap a link (no tick, it opens).
