# Haptic feedback on touch devices

Date: 2026-10-06
Status: approved design, awaiting spec review

## Goal

Make Purl feel more native on phones and tablets by giving haptic feedback at
a few meaningful moments, on iOS and Android. Haptics only: other mobile
polish is out of scope for this round.

Success: on an iPhone and on Android Chrome, the moments below tick; nothing
else does; no control behaves differently than today (no double actions, links
still open, scrolling unaffected); desktop is untouched.

## Platform constraints

- **iOS (every iOS browser is WebKit): no haptic API.** The only route is the
  native switch, `<input type="checkbox" switch>` (Safari 17.4+), which ticks
  when a real tap toggles it. Toggling it from code stopped working around iOS
  26.5, so the tap itself must land on a `<label>` wired to the switch. This is
  the technique of [ios-haptics](https://github.com/tijnjh/ios-haptics) v3
  (MIT). Consequences:
  - The tick plays when the tap is released, not on touch-down.
  - No tick after asynchronous work (a network response) or from a timer.
  - One kind of tick: no light/heavy or success/warning variants.
  - A `preventDefault()` on the tap's click cancels the label's activation, so
    no tick.
  - The switch itself must never sit under the finger: WebKit treats a
    touchstart on it as handled, which cancels scrolling (ios-haptics #11, #13).
- **Android (Chrome, Firefox): `navigator.vibrate(pattern)`.** Callable from
  code, including on timers, once the page has had a user gesture. Desktop
  Chrome also exposes `vibrate` (it does nothing), so we gate on a coarse
  pointer.
- **No in-app setting.** iOS follows the system "System Haptics" switch;
  Android follows the phone's vibration settings.

## Building blocks

### `haptic(kind)`: `src/lib/haptics.ts` (Android)

```ts
export type HapticKind = "selection" | "success" | "warning";
export function haptic(kind: HapticKind): void;
```

- Calls `navigator.vibrate` only when it exists and
  `matchMedia("(pointer: coarse)")` matches.
- Patterns (ms): `selection` `[10]`; `success` `[10, 60, 10]`; `warning`
  `[25, 60, 25]`. Exported as `HAPTIC_PATTERNS` for tests.
- Never throws (a throwing `vibrate` is swallowed). Does nothing on the server,
  on iOS (no `vibrate`) and on desktop.

### `<HapticTarget />`: `src/components/haptic-target.tsx` (iOS)

Renders, as the last child of a positioned (`relative`) tap target:

```html
<label aria-hidden="true" data-haptic-target
       class="absolute inset-0 hidden pointer-coarse:block touch-manipulation
              [-webkit-tap-highlight-color:transparent]">
  <input type="checkbox" switch tabindex="-1"
         class="absolute size-px m-0 invisible" />
</label>
```

- Only on touch screens (`pointer-coarse:`, a CSS variant), so there's no
  overlay on desktop and no hydration mismatch.
- Hidden from screen readers (`aria-hidden`) and from keyboard focus
  (`tabindex=-1` on the switch; a label isn't focusable).
- The label forwards its click to the switch as a second, synthetic click. The
  switch's click handler stops that click's propagation, so the element's
  handlers run once.
- Props:
  - none (**pass-through**): the tap's click bubbles to the element's own
    handler. For elements whose handlers don't call `preventDefault()`: menu
    items, buttons, switches.
  - `onTap(event)` (**owner**): the label handles the tap itself, calls
    `onTap`, and stops propagation. For rows, cards and their checkboxes,
    whose handlers call `preventDefault()` (which would cancel the tick). The
    owner overlay is placed outside the row's or card's `<a>`, so no link is
    in the click's path.
  - `className`, for stacking (`z-*`) where needed.
- A comment credits ios-haptics (MIT) for the technique.

Each moment uses both pieces: `<HapticTarget />` in the element (iOS) and
`haptic(kind)` in the action (Android).

## Moments

| Moment | Where | Kind | iOS placement |
|---|---|---|---|
| Public switch | `ui/switch.tsx` (all switches) | selection | pass-through |
| Folder tags | `view-mode-menu.tsx` (`FolderTagsMenuItem`) | selection | pass-through |
| Long-press starts selecting | `link-item.tsx`, `link-card.tsx` (`useLongPress`) | selection | owner overlay, see below |
| Tap a row or card while selecting | `link-item.tsx`, `link-card.tsx` | selection | owner overlay over the row or card |
| Row or card checkbox | `link-item.tsx`, `link-card.tsx` | selection | owner overlay on the checkbox |
| Select all | `link-selection-bar.tsx` | selection | pass-through |
| Mark read / unread (bar) | `link-selection-bar.tsx` | success | pass-through |
| Delete (bar) | `link-selection-bar.tsx` | warning | pass-through |
| Move: folders, "Remove from …", "New folder…" | `link-selection-bar.tsx` | success | pass-through |
| Mark read / unread (row menu) | `link-menu.tsx` | success | pass-through |
| Move to folder items (row menu) | `link-folder-submenu.tsx` (`LinkFolderItems`) | success | pass-through |
| Delete (row menu) | `link-menu.tsx` | warning | pass-through |
| Copy link | `folder-share-popover.tsx` | success | pass-through |

**Long-press:** Android vibrates when the 500ms timer fires. On iOS, the
long-press starts selecting, which mounts the owner overlay over every row and
card, so the finger's lift lands on it and ticks. Its `onTap` sees that the
long-press already selected the row (the existing `longPressedRef` /
`consumeLongPress`), so it doesn't toggle the row back. Unknown until checked:
whether iOS sends that lift-click to an overlay mounted mid-press. If it
doesn't, long-press stays Android-only and nothing else changes.

**Left out on purpose:** opening a link, opening menus, switching folders, the
search field, clearing the selection (✕), keyboard shortcuts (no touch
involved), and anything after a network response (iOS can't do it, so the two
platforms would diverge).

## Testing

- **Unit (`src/lib/haptics.test.ts`):** each kind sends its pattern to a
  stubbed `navigator.vibrate`; nothing happens without `vibrate`, with a fine
  pointer, or on the server; a throwing `vibrate` is swallowed.
- **e2e (`e2e/haptics.spec.ts`, Chromium and WebKit, `hasTouch` / `isMobile`):**
  - Behaviour unchanged with the overlays: the Public switch and Folder tags
    still save; menu items act once; Delete still shows its Undo toast; a tap
    toggles a row while selecting and opens the link when not.
  - The tick would play: after each tap, the hidden switch's `checked` has
    flipped (the proxy for an iOS haptic in CI).
  - Android: a stubbed `navigator.vibrate` records the expected pattern per
    moment.
  - Desktop (no touch): no `[data-haptic-target]` is visible; Tab order and
    accessible names are unchanged.
- **Existing suites must still pass:** owner-grid, bulk-selection,
  link-row-phone, reading-state, shared-folders.
- **iOS Simulator:** the long-press check (switch flipped after a long-press
  lift) and the switch flips in general. It has no haptic motor.
- **Real devices (owner sign-off):** iPhone (released app or a preview build)
  and Android Chrome, following a checklist of the moments above.

## Out of scope

Other mobile polish (tap highlight, overscroll, safe areas, press states),
haptics for async results, an in-app on/off setting, and an `ios-haptics`
dependency.
