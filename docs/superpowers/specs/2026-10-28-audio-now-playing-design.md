# Audio pearls as a now-playing bar

**Date:** 2026-10-28
**Status:** draft for review
**Builds on:** `2026-10-27-media-viewer-design.md` (the viewer, its morph and URL state), `2026-10-27-media-uploads-embeds-design.md` (audio pearls, `AudioFace`)
**Reference:** Bencho's "Now playing" component (bencho.dev, MIT), whose shape, proportions and motion notes this adopts; the mockups on the "Purl audio player mockups" canvas, top artboard.

## Summary

An audio pearl's card becomes a compact **now-playing bar**: a sleeve, the title with its second line, a play button at the end, and a thin track along the foot. Opening the pearl (a click on the bar outside its controls, or from a row) morphs the bar into the media viewer's **opened player**, the same arrangement grown downward: the sleeve bigger, the words beside it, the track with its times, and the transport moved from the end of the bar to the middle. The sleeve, the words and the play button travel as one object through the morph; playback continues across it.

The waveform direction (stored peaks, wavesurfer) is dropped: no new column, no decoding, no new dependency.

## Where it shows

| Surface | Today | Now |
| --- | --- | --- |
| Owner's grid card (`LinkCard` → `LinkCardContent`) | `AudioFace` strip (big play, range, time) above `LinkCardStrip` | The bar is the whole card: no separate title strip |
| Shared folder card (`SharedLinkCard`) | The same strip in a frame, a button over the rest | The bar in the frame, the open button over the rest |
| Hover preview (`LinkPreviewBody`) | The strip, then title/description | The bar, then the description if any |
| Media viewer (`ViewerAudio`) | Title above a 480px strip with a 56px play | The opened player, 320px wide |
| List row | Icon slot, title, second line | Unchanged (the icon slot is the sleeve at 20px) |
| Pending upload (audio) | Icon on a tint at the card ratio, a progress ring | The bar's shape: the icon sleeve, the file name, the ring where play sits |
| Landing demo | The strip, play works, nothing opens | The bar, play works, nothing opens |

## The bar

Width: the card's. Height 78px. Padding 10px all round (`PAD`), one margin for both states as the reference insists, so nothing slides inward when it opens.

- **Sleeve**, 40px square, radius 6, at the left: the pearl's `thumbnail` when it has one (an audio link whose page has an image), else the Reicon music icon on `bg-muted`. Never generated art. With Folder tags on, the folder badge rides its bottom-end corner, as it rides a favicon's today. While selecting, or on hover with a pointer, the owner's checkbox replaces the sleeve (the row's pattern for its favicon), so the card keeps no top-left checkbox over a thumbnail it doesn't have.
- **Words**, beside the sleeve and centred on its height: the title (13px, medium, one line, truncated) and `linkSecondLine` ("Audio · 2:36", or the domain) at 11px muted. On the phone grid (171px cards) the second line is just the length.
- **Play**, 30px, filled `bg-foreground`, at the end of the row; the drawn play/pause mark (below). The owner's card keeps its `⋯` menu after the play button, in its own 32px slot so nothing reflows when it appears (hover with a pointer, always on touch, as the card's today); the shared card and the preview have no menu.
- **Track**, inset by `PAD` along the foot: a 3px rail at `foreground/12` with the played run in `foreground`. It is the seek control: the existing `<input type="range">` lies over it, transparent, 16px tall for the finger, keyboard-operable, named "Seek <title>" with the same `aria-valuetext`; focus draws the ring around the rail.
- The card's radius stays the grid's 10px (`MEDIA_RADIUS`). Bencho's box radius is the sleeve's plus the margin (concentric); at these sizes that would make a 16px card beside 10px image cards, so cohesion wins and the sleeve's 6px is chosen so the mismatch is under the threshold the reference itself describes for small radii.

No times on the bar: the second line already says the length, and the run says how far.

## The opened player (the viewer)

Width `min(320px, 100vw − 32px)`; the same `PAD`. Stacked from the sleeve down, each gap measured from the thing above it, so the height falls out of the sum:

- Sleeve 64px square, radius 12, at `PAD`; the words beside it, centred on its height: title 15.5px, second line 12px. The viewer's Close button sits in the top-right corner as it does for every pearl; the words leave it room.
- 22px under the sleeve, the track: the same rail and range, then 8px under it the times, 11px tabular at line-height 1: elapsed at the left, remaining (`−2:14`) at the right, muted.
- 16px under the times, the transport, centred: **Restart** (34px, outlined icon, seeks to 0), **Play** (46px, filled, the drawn mark), **Open file** (34px, a link to the file in a new tab, the row menu's item). No heart: Purl has no likes. No skip: a pearl is one file; the viewer's Previous/Next arrows already move between pearls.
- 10px under the transport, the box ends: 218px tall.

When the pearl has neighbours (`roomForArrows`), the content's horizontal padding is 48px instead of 10 so the viewer's arrows at the box's sides never cover the track's ends; the sleeve, the words and the transport narrow with it. (The reference's "the width never changes" is about its own in-place morph; here the box morphs from a card of whatever width the grid gives it into the 320px player, which is the viewer's morph for every kind.)

## The morph: one object

The whole bar is the pearl's `MediaAnchor` (`layoutId="pearl-<id>"`), so the box morphs as every media card's does. Inside it, three elements are **shared layout elements** with their own ids, present in both the bar and the opened player, so Motion carries each from its place in the bar to its place in the player while the box grows:

- the sleeve (`pearl-<id>-sleeve`): 40 → 64, radius 6 → 12, stays at `PAD`;
- the words (`pearl-<id>-words`): beside the sleeve at both ends, type 13/11 → 15.5/12;
- the play button (`pearl-<id>-play`): from the end of the bar to the middle of the transport, 30 → 46.

The track stays at the foot of the bar and lands under the words in the player: it is not shared (its two positions are not one motion), it fades out of the bar at the start and in at its new place with the things that exist only in the player (the times, Restart, Open file), which arrive in the last 40% of the morph so they settle into a box that has stopped growing. Closing runs the same in reverse. The viewer's Previous/Next, the backdrop and the URL state are untouched. Under reduced motion: Cambio's `reduced` preset for the box, no layout animation for the children, a 150ms opacity for the late elements, the mark swaps at once.

If nested shared elements fight Cambio's Popup in practice (a stretch, a flicker, a wrong lead), the fallback is each child animating its own box with `layout` (Motion's scale correction, no shared id), which never distorts; the plan's hand-check decides.

## The drawn play/pause mark

Bencho's `Mark` comes across as `PlayMark` (`src/components/play-mark.tsx`, MIT notice and the source's comments kept): the pause is two bars and the play is the same two quadrilaterals with their inner edges pulled to the middle, tweened over 300ms with its "goo" (a squash, a lean and a 9° tip that returns to level), so the button never cuts between two icons. Instant under reduced motion. Used by the bar's play (12px glyph) and the player's (18px). No Lucide: the skip glyphs it sat beside don't exist here; Restart and Open file use Reicon.

## Playback: one element, continued across the morph

Today each `AudioControls` owns an `<audio>` and the viewer's player has its own store id, so opening a playing pearl stops the card and starts over. For one object that can't stand. `audioPlayerStore` (`src/hooks/use-audio-player.ts`) now owns **one `<audio preload="none">` for the page**, created on first use in the browser, and exposes a snapshot `{ id, playing, elapsed, length, failed }` plus `toggle(id, src)`, `stop(id)`, `seek(seconds)`, `restart()`. The bar and the opened player are two views of it: pressing play on a card starts the element with that pearl's file; opening the pearl shows the same elapsed and the same mark mid-motion; closing leaves it playing on the card. Starting another pearl stops the first (one element, so one at a time is structural). `ended`, `pause` from outside (media keys), `error` and a leaving pearl (deleted, moved out) update the store; `viewerAudioId` goes away; `useIsMediaOpen`'s masking of card video previews is unchanged. The viewer no longer calls `audioPlayerStore.stop` on open.

## Accessibility

- The bar's play has the name "Play <title>" / "Pause <title>" and `aria-pressed`; the range is "Seek <title>" with `aria-valuetext` "0:22 / 2:36"; Restart "Restart <title>"; Open file is a link named "Open file".
- The opened player's dialog name and description are the viewer's `Cambio.Title`/`Description` as today (title, second line); the times are plain text, not a live region.
- Touch: play is 30px drawn with the project's `pointer-coarse:` extension to 44px; the range is 16px tall with a 44px hit area; the checkbox over the sleeve 40px.
- Contrast: times and the second line use `text-foreground/70` on the card, as the current strip does (the muted pair fails 4.5:1 at 12px in light mode).
- Forced colours and the hover preview follow the card.

## Not in scope

Waveforms, likes, queues or skipping between files, a mini player that persists across pages, artwork for uploads (the sleeve is the icon), zoom.

## Tests

- Unit: the store's snapshot transitions (toggle, stop, seek, ended, error, switching pearls), `PlayMark`'s path interpolation at t = 0, 0.5 and 1.
- e2e (`e2e/media-links.spec.ts`, `e2e/media-viewer.spec.ts`, `e2e/owner-grid.spec.ts`): the bar's parts and names; play on the card then open the viewer → the player shows the same elapsed and "Pause"; close → the card still plays; one element at a time across two cards; seek by keyboard; selecting clicks on the bar select; the shared card's play works inline; reduced motion; the pending audio card's shape.

## Amendment (2026-10-28): the player opens in place, never in the viewer

The sections "The opened player (the viewer)" and "The morph: one object" above are superseded. The audio pearl keeps the reference's exact behaviour: the bar **expands in place**, inside the grid, into the opened player, and collapses back. Audio pearls never open the media viewer.

- **One number is the state.** A single tween `p` (0 shut, 1 open; 460ms, quart-out, reading its start from wherever it is so a second press turns it around; instant under reduced motion) drives every position, size, radius and type size: height 78 → 189; the sleeve 40 → 64 at radius 6 → 12, at `PAD` in both; the words beside it at 13/11 → 15.5/12; the track from the bar's foot to 22px under the sleeve; the times and the transport (Restart, the 46px Play, Open file) ride `late = clamp((p − 0.6) / 0.4)`, so they arrive into a shape that has stopped growing. The width never changes (it is the column's). On close only, the whole object dips to 0.965 and back (the reference's swell), subtractive, working with the shrink.
- **The sleeve stays the play control on the bar.** Once open, the transport's Play is the control and the sleeve's mark fades with `late`; the sleeve shows the icon or the thumbnail.
- **What opens it.** A press on the bar outside its controls (the whole bar when shut; the sleeve-and-words row when open), as a button named "Expand <title>" / "Collapse <title>" with `aria-expanded`. Esc collapses. A pointer press outside the card (`pointerdown`, trusted events only, armed a tick after opening) collapses it. One pearl is open at a time, in a small module store (`audioExpansion`). Opening never changes playback; playback never changes the open state.
- **The grid follows.** The masonry re-places cards on every resize (`ResizeObserver`), so the cards below move down with the growth, frame by frame, and back.
- **Where.** The owner's grid card and the shared folder's grid card expand in place. **List rows keep the row layout** (amended 2026-10-28, second pass): an audio row is a normal 48/56px row with the icon slot, the title and "Audio · 2:36", the checkbox on the icon on hover or while selecting, and the `⋯` floating over the row's end; a click on the row (its main element, a button named "Play <title>" / "Pause <title>") toggles playback, and while the pearl is loaded in the store (playing or paused) the **icon slot draws the play/pause mark** in place of the music icon (fourth pass: the `⋯` keeps its place and behaviour on every row; the checkbox still takes the slot on hover with a pointer, while selecting, or after a long-press on touch), and the second line reads the elapsed over the length ("0:22 / 2:36"). Rows don't expand. The hover preview shows the bar and doesn't expand.
- **The hover preview is a player card** (third pass, 2026-10-28): a row's hover preview for an audio pearl is not the bar but a card in the preview's width (256px, the hover card's width): a **hero** the preview's full width and 180px tall showing the pearl's sleeve art (the thumbnail, `object-cover`; an upload without one shows the music icon at 48px centred on the muted tint), fading into the hover card's surface so the text sits on a near-solid foot (the fade spans the hero's lower 120px and is ≥ 90% surface under the text); over the fade's foot, the **title** (16px/22px, medium, two lines at most) and the second line (`linkSecondLine`, 13px, muted); under them the **track** (the 3px rail with the run in the foreground colour, the same `AudioTrack` as the bar, a scrubber) with the elapsed at the left and the length at the right (11px tabular, `text-foreground/70`); then the **transport** centred (Restart 34, Play 46 with the drawn mark, Open file 34, `gap-3.5`), 16px of padding around the lower part and 16px under the transport. It is a view of the store like the bar (playback shared with the row and the card); it does not expand. The reference's green run and its skip buttons are not adopted: the run is the foreground colour, the side buttons are Restart and Open file.
- **The card's menu floats** (same pass): the owner's bar reserves no slot for the `⋯`; it floats over the bar's top-right corner on hover with a pointer and always on touch, on a backing of the bar's surface, exactly as the other cards' menus do, so the words take the full width at rest. The landing demo's audio card plays and expands like the owner's (both are client-only; the demo makes no requests).
- **The viewer.** Images and video only. Audio pearls aren't registered with it, its Previous/Next skip them, and `?pearl=<audio id>` is stripped like an unknown id. The row menu's "Open file" and the opened player's Open file link remain the way to the file itself.
- **Removed from the earlier sections.** The viewer's opened player, the shared `layoutId` parts, the late-arrival plumbing inside the viewer, the viewer-side presence and "moved off" logic.

## Deviations from the reference

The box radius is the grid's 10px, not sleeve + margin; the width changes with the morph (the viewer's box is 320px, a card's is the grid's); no heart, no skip; the track is a scrubber (the reference's isn't); the open state is the media viewer, not an in-place growth.
