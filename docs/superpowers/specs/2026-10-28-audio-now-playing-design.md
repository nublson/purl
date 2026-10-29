# Audio pearls as a now-playing bar

**Date:** 2026-10-28
**Status:** draft for review
**Builds on:** `2026-10-27-media-viewer-design.md` (the viewer, its morph and URL state), `2026-10-27-media-uploads-embeds-design.md` (audio pearls, `AudioFace`)
**Reference:** Bencho's "Now playing" component (bencho.dev, MIT), whose shape, proportions and motion notes this adopts; the mockups on the "Purl audio player mockups" canvas, top artboard.

## Summary

An audio pearl's card becomes a compact **now-playing bar**: a sleeve that is its play control, the title with its second line, and a thin track along the foot. A press on the bar outside its controls expands it **in place**, inside the grid, into its **opened player**, the same arrangement grown downward: the sleeve bigger, the words beside it, the track with its times, and the transport (Restart, Play, Open file) under them. Audio pearls never open the media viewer (see the amendment below); playback is one element for the page, so the bar, the player, the row and the hover preview all show one playback.

The waveform direction (stored peaks, wavesurfer) is dropped: no new column, no decoding, no new dependency.

## Where it shows

| Surface | Today | Now |
| --- | --- | --- |
| Owner's grid card (`LinkCard`) | `AudioFace` strip (big play, range, time) above `LinkCardStrip` | The bar is the whole card (no separate title strip); it expands in place into the player |
| Shared folder card (`SharedLinkCard`) | The same strip in a frame, a button over the rest | The bar in the frame; it expands in place like the owner's |
| Hover preview (`LinkPreviewBody`) | The strip, then title/description | A 256px player card (`AudioPreview`): the sleeve art as a hero, the title and second line over its fade, the track with its times, the transport; it doesn't expand |
| Media viewer (`ViewerAudio`) | Title above a 480px strip with a 56px play | Gone: audio pearls never open the viewer |
| List row | Icon slot, title, second line | The row layout kept (`AudioRow`): a click on the row plays and pauses; while the pearl is loaded the icon slot draws the play/pause mark and the second line reads "0:22 / 2:36"; rows don't expand |
| Pending upload (audio) | Icon on a tint at the card ratio, a progress ring | The bar's shape: the icon sleeve, the file name, the ring where play sits |
| Landing demo | The strip, play works, nothing opens | The bar, play works, it expands in place like the owner's |

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

- The bar's play (the sleeve) has the name "Play <title>" / "Pause <title>", the name flipping with the state (no `aria-pressed`); the range is "Seek <title>" with `aria-valuetext` "0:22 / 2:36"; Restart "Restart <title>"; Open file is a link named "Open file".
- The bar's opener is a button named "Expand <title>" / "Collapse <title>" with `aria-expanded`; the times are plain text, not a live region.
- Touch: the sleeve's play is 40px drawn with the project's `pointer-coarse:` extension to 44px; the range is 16px tall with a 44px hit area; the checkbox over the sleeve 40px.
- Contrast: times and the second line use `text-foreground/70` on the card, as the current strip does (the muted pair fails 4.5:1 at 12px in light mode).
- Forced colours and the hover preview follow the card.

## Not in scope

Waveforms, likes, queues or skipping between files, a mini player that persists across pages, artwork for uploads (the sleeve is the icon), zoom.

## Tests

- Unit: the store's snapshot transitions (toggle, stop, seek, ended, error, switching pearls), `PlayMark`'s path interpolation at t = 0, 0.5 and 1.
- Unit: the expansion store (`audio-expansion`, one open at a time) and the masonry's growth in place (`masonry.test.ts`: a growing card keeps its column).
- e2e (`e2e/media-links.spec.ts`, `e2e/media-viewer.spec.ts`, `e2e/link-row-phone.spec.ts`, `e2e/bulk-selection.spec.ts`): the bar's parts and names; one pearl plays at a time; a file that won't load goes back to Play; the bar expands in place and the grid follows it frame by frame, and Esc or a press outside its card collapses it (a press in the card's menu doesn't; on a phone a scroll that starts outside doesn't, a tap outside does); reduced motion jumps; the keyboard path (the opener, Esc back to it); selecting clicks on the bar select; the shared card expands and plays in place; the audio row plays from a click and draws the mark in its icon slot; the hover preview's player card and the card are one playback; audio pearls never open the viewer; the pending audio card's shape.

## Amendment (2026-10-28): the player opens in place, never in the viewer

The sections "The opened player (the viewer)" and "The morph: one object" above are superseded. The audio pearl keeps the reference's exact behaviour: the bar **expands in place**, inside the grid, into the opened player, and collapses back. Audio pearls never open the media viewer.

- **One number is the state.** A single tween `p` (0 shut, 1 open; 460ms, quart-out, reading its start from wherever it is so a second press turns it around; instant under reduced motion) drives every position, size, radius and type size: height 78 → 189; the sleeve 40 → 64 at radius 6 → 12, at `PAD` in both; the words beside it at 13/11 → 15.5/12; the track from the bar's foot to 22px under the sleeve; the times and the transport (Restart, the 46px Play, Open file) ride `late = clamp((p − 0.6) / 0.4)`, so they arrive into a shape that has stopped growing. The width never changes (it is the column's). On close only, the whole object dips to 0.965 and back (the reference's swell), subtractive, working with the shrink.
- **The sleeve stays the play control on the bar.** Once open, the transport's Play is the control and the sleeve's mark fades with `late`; the sleeve shows the icon or the thumbnail.
- **What opens it.** A press on the bar outside its controls (the whole bar when shut; the sleeve-and-words row when open), as a button named "Expand <title>" / "Collapse <title>" with `aria-expanded`. Esc collapses. A pointer press outside the card (trusted events only, armed a tick after opening) collapses it: with a mouse or pen on `pointerdown`; with a finger only on a tap's lift (its `pointerup` with no `pointercancel` before it), so a scroll that starts outside the card keeps the player open (final review, 2026-10-28; not a click, which iOS Safari doesn't send for a tap on a plain area). One pearl is open at a time, in a small module store (`audioExpansion`). Opening never changes playback; playback never changes the open state.
- **The grid follows.** The masonry re-places cards on every resize (`ResizeObserver`), so the cards below move down with the growth, frame by frame, and back.
- **Where.** The owner's grid card and the shared folder's grid card expand in place. **List rows keep the row layout** (amended 2026-10-28, second pass): an audio row is a normal 48/56px row with the icon slot, the title and "Audio · 2:36", the checkbox on the icon on hover or while selecting, and the `⋯` floating over the row's end; a click on the row (its main element, a button named "Play <title>" / "Pause <title>") toggles playback, and while the pearl is loaded in the store (playing or paused) the **icon slot draws the play/pause mark** in place of the music icon (fourth pass: the `⋯` keeps its place and behaviour on every row; the checkbox still takes the slot on hover with a pointer, while selecting, or after a long-press on touch), and the second line reads the elapsed over the length ("0:22 / 2:36"). Rows don't expand. The hover preview shows the bar and doesn't expand.
- **The hover preview is a player card** (third pass, 2026-10-28): a row's hover preview for an audio pearl is not the bar but a card in the preview's width (256px, the hover card's width): a **hero** the preview's full width and 180px tall showing the pearl's sleeve art (the thumbnail, `object-cover`; an upload without one shows the music icon at 48px centred on the muted tint), fading into the hover card's surface so the text sits on a near-solid foot (the fade spans the hero's lower 120px and is ≥ 90% surface under the text); over the fade's foot, the **title** (16px/22px, medium, two lines at most) and the second line (`linkSecondLine`, 13px, muted); under them the **track** (the 3px rail with the run in the foreground colour, the same `AudioTrack` as the bar, a scrubber) with the elapsed at the left and the length at the right (11px tabular, `text-foreground/70`); then the **transport** centred (Restart 34, Play 46 with the drawn mark, Open file 34, `gap-3.5`), 16px of padding around the lower part and 16px under the transport. It is a view of the store like the bar (playback shared with the row and the card); it does not expand. The reference's green run and its skip buttons are not adopted: the run is the foreground colour, the side buttons are Restart and Open file.
- **The card's menu floats** (same pass): the owner's bar reserves no slot for the `⋯`; it floats over the bar's top-right corner on hover with a pointer and always on touch, on a backing of the bar's surface, exactly as the other cards' menus do, so the words take the full width at rest. The landing demo's audio card plays and expands like the owner's (both are client-only; the demo makes no requests).
- **The viewer.** Images and video only. Audio pearls aren't registered with it, its Previous/Next skip them, and `?pearl=<audio id>` is stripped like an unknown id. The row menu's "Open file" and the opened player's Open file link remain the way to the file itself.
- **Removed from the earlier sections.** The viewer's opened player, the shared `layoutId` parts, the late-arrival plumbing inside the viewer, the viewer-side presence and "moved off" logic. The Summary, "Where it shows", "Accessibility" (no `aria-pressed`: the names flip), "Tests" and "Deviations from the reference" were brought in line with the passes below at the final review.

## Deviations from the reference

The box keeps the grid's 10px corner, not sleeve + margin; the width is the host's (the grid's column), unchanged by the morph; the sleeve is the play control on the shut bar (the reference's play sits at the row's end); the track is a scrubber (the reference's isn't); no like, no skip.

## Revision (2026-10-29): the grid card is the player card

The user simplified the grid: an audio pearl's card is now exactly the hover preview's player card (`AudioPlayer` in `src/components/audio-player.tsx`: the 180px hero with the title over its fade, the track, the times and the transport), at the card's width. The now-playing bar, its in-place expansion (the tween, the late parts, the swell, Esc and the outside press, `audioExpansion`) and the masonry's growth handling are gone; the owner's card takes the checkbox and `⋯` in the hero's corners like every card, and the pending audio upload is the player's shape. List rows, the store and the drawn mark are unchanged.
