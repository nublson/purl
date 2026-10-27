# Media Viewer — Design

## Problem

Image, video and audio pearls (uploads and media links) render as their media in cards and rows, but opening one still sends the reader to the file's URL in a new tab, out of Purl. A moodboard wants the opposite: the card grows into the picture, the picture steps to the next one, and it shrinks back to its card. This is the "lightbox" the media uploads spec (`2026-10-27-media-uploads-embeds-design.md`) left for its own plan.

**Goal:** media pearls open in an in-app viewer that morphs out of the card (or row) you clicked and back into the card you end on, moves between the list's media pearls, lives in the URL, and works on phones, with the keyboard and with a screen reader. Everything else about a pearl stays where it is.

## Decisions

Settled with the user during brainstorming:

- **Library: Cambio** (`cambio`, MIT, built on Base UI's Dialog and Motion's layout animations). It gives the accessible dialog, the morphing popup, motion presets and reduced-motion handling. It brings `@base-ui/react` beside the Radix the app uses for every other overlay; accepted for this one surface.
- **Scope: media pearls everywhere.** Image, video and audio pearls (uploads and media links) open the viewer from grid cards, list rows and the shared folder page. Page links, PDFs and YouTube keep opening in a new tab until the embeds plan.
- **Navigation within the list:** left/right arrows, on-screen buttons and swipe move between the media pearls shown in the current list (Home, the folder, or the shared page) without closing.
- **Motion: morph on open and close only.** Open morphs from the card; close morphs back to whichever card you are on; next/previous slides the media inside the viewer (a crossfade under reduced motion).
- **Chrome: media only.** No title bar, no actions; the title and kind/length line are the dialog's accessible name and description. Actions stay in the card and row menus.
- **URL state: `?pearl=<id>`**, pushed on open, replaced on navigation, so Back closes on phones and a shared folder's viewer link opens on that pearl.
- **Architecture: one viewer per page, with our own morph anchors.** Each face carries a Motion `layoutId` and the page's single `Cambio.Root` morphs its Popup to and from it. `Cambio.Trigger` isn't used (a Trigger reads its Root's single `layoutId`, so every card in one Root would share it). The alternatives were rejected: one Root per card (navigation becomes two morphs and Home gets a thousand dialog roots) and no Cambio (rebuilding what it ships on Radix).

Out of scope: a zoom or pinch gesture of our own (the browser's zoom works), a per-pearl Open Graph image for `?pearl=` links, actions or details in the viewer, opening page links or PDFs in it, the landing demo (it keeps new tabs and no viewer), and changing how the card's own inline playback works.

## Architecture

### The store

`src/lib/media-viewer.ts`, a store outside React (`useSyncExternalStore`, like `linkSelection`):

- `mediaViewer.register(links: Link[])`: the page's media pearls (kinds `image`, `video`, `audio` by `linkKind`) in display order. `HomeShell` calls it where it registers selectable links, after every reload; `SharedFolderList` calls it as pages load. Pearls that leave the list leave the viewer's list; if the current one leaves, the viewer moves to its neighbour (the next, else the previous) or closes when none is left.
- `mediaViewer.open(id)`, `close()`, `next()`, `prev()`.
- State `{ openedId: string | null; currentId: string | null; items: Link[] }`. `openedId` is the pearl the morph started from and stays fixed while open; `currentId` moves with navigation; both are equal until you navigate.
- Hooks: `useMediaViewer()` (the viewer) and `useIsMediaOpen(id)` (a face).

Nothing is persisted on the account.

### The URL

`src/lib/media-viewer-url.ts` (pure helpers over a `history`-like interface, so they test without a browser):

- Open pushes a history entry with `?pearl=<id>` (other params kept). Next/previous `replaceState` the id. Closing from inside the viewer calls `history.back()` when the viewer pushed the entry, else strips only its own param with `replaceState`.
- A `popstate` listener closes the viewer when the param is gone (Back on phones).
- On load with `?pearl=<id>`: the viewer opens once the registered list contains the id. On the owner's pages, when it is not in the loaded list (older than the first page), the page fetches it through the existing single-link route (`GET /api/links/[id]`, session-only) and the viewer opens on it alone: no card to morph from, so it fades in, with next/previous disabled. On the shared page there is no single-link endpoint, so an unknown id is ignored.
- The Settings dialog owns `?settings=` with the same push/replace pattern; each strips only its own param.

### Triggers and the morph

The morph pairs two elements sharing a Motion `layoutId`: a face and Cambio's Popup.

- Each media face wraps its media in `m.div layoutId={"pearl-" + link.id}` (the `m` components under the app's `LazyMotion`). The feature bundle in `src/lib/motion-features.ts` moves from `domAnimation` to `domMax` (layout animations), still loaded after hydration (about 15 KB more).
- The viewer, Cambio included, is a `next/dynamic` chunk loaded when a page registers its first media pearl, so Home's first paint doesn't pay for it.
- **Grid cards (owner):** the card's overlay `<a>` becomes a `<button>` for media pearls, named by the title (no "(opens in new tab)"), calling `mediaViewer.open(link.id)`. Checkbox, ⋯ menu, folder badge, long-press and selection are unchanged; while selecting, a click toggles the card. The audio strip's Play keeps playing inline; the card's button opens the viewer.
- **Grid cards (shared page):** the `<a>` becomes the same button for media pearls; the audio card keeps its player beside the button (the structure from the interface review). Page links keep their anchors.
- **List rows (owner and shared):** the row's main link becomes a button for media pearls; the row's preview square (the `LinkIcon`) carries the `layoutId`, so the morph grows out of the thumbnail, with Cambio's `snappy` preset for rows (the start rect is tiny). Hover previews are unchanged.
- **What morphs per kind:** images morph their preview, and the original loads on top once the morph completes (`onOpenChangeComplete`), fading in over the preview, so nothing flashes; videos morph their poster (or current frame) and the viewer swaps in the player on completion; audio morphs its kind tile into the viewer's player; a failed image morphs its icon tile.
- **Playback hand-off:** `useLiveCards` treats the open pearl's card as not wanted (`useIsMediaOpen`), so the grid's muted loop pauses while the viewer plays with sound; the audio store stops a card's playback when the viewer opens on it.
- **Close target:** the Root's `layoutId` is `pearl-<openedId>` while open. On close after navigation, the viewer sets the Root's `layoutId` to `pearl-<currentId>` and closes on the next frame, so the Popup morphs back to the card you ended on. When that card isn't mounted, Motion has no target and the Popup fades: the intended fallback.

### Inside the viewer

`src/components/media-viewer.tsx`: one `Cambio.Root` (controlled `open` / `onOpenChange` from the store, `layoutId` as above, `modal`, `dismissible={false}` because the drag is ours), `Cambio.Portal`, `Cambio.Backdrop`, `Cambio.Popup`, a visually hidden `Cambio.Title` (the pearl's title) and `Cambio.Description` (the kind/length line from `uploadMeta`, else the domain).

- **Layout:** the Popup is a fixed box sized to the media, `max-width: min(100vw - 32px, 1200px)`, `max-height: calc(100dvh - 32px)` with safe areas added on phones; the media `object-contain`, centered. The backdrop is `bg-background/85` with a 12px blur.
- **Image:** `<img>` of the original (`link.url`), the preview underneath until it loads; `alt` is the title.
- **Video:** `<video controls autoplay playsInline>` with sound (opened by a click, so autoplay is allowed), `poster` the preview. A file that can't play keeps the poster, a "Can't play this video" line and the native controls.
- **Audio:** the card's player at viewer size: a 56px play button, the scrubber, time, the title above it, on `bg-card`.
- **Navigation:** previous/next as two round icon buttons at the left and right edges (absent when there's no neighbour; always shown on touch, on hover or focus with a pointer). Keys on the Popup: ←, →, Home, End. Swipe: a Motion `drag` on the media wrapper with `dragDirectionLock`; a horizontal drag past 80px or 400px/s commits to the neighbour, a vertical one past the same closes; the drag scales the media to 0.95 and fades the backdrop as it goes. The slide is 200ms on the project's `--ease-out-strong`, the leaving media out and the arriving one in; under reduced motion a 150ms opacity crossfade. The slide never morphs.
- **Preloading:** the current pearl's two neighbours' originals are warmed (`new Image()` for images; videos get `preload="metadata"` only once current).
- **Closing:** Esc and backdrop press (Base UI), the vertical drag, Back on phones, and a 44px X in the top-right (inside the safe area) for touch screen reader users. Focus returns to the opened card's button by default; after navigation, `finalFocus` is the current card's button, where the morph lands.
- **While open:** realtime reloads keep running; the registered list updates in place; a deleted current pearl moves the viewer to a neighbour or closes it.

### Accessibility, reduced motion, phones

- Base UI gives `role="dialog"`, `aria-modal`, focus trap and loop, focus in on open (`initialFocus`: the media wrapper, `tabindex="-1"`, so the first Tab reaches the previous/next buttons) and focus return on close; background content is inert while open.
- Names: the dialog by the title; "Previous pearl" / "Next pearl" with `aria-keyshortcuts="ArrowLeft"` / `"ArrowRight"`; "Close".
- A polite live region inside the Popup says "3 of 12: Morning birds" when the current pearl changes.
- The face's button is a real `<button>` (Enter and Space open it) and keeps the card frame's focus ring; the row's button takes the row link's Tab position.
- Reduced motion: Cambio's Root reads the preference and uses its `reduced` preset; our slide becomes a 150ms crossfade, the drag scale is dropped, and the video doesn't autoplay in the viewer. The account's "Play videos" setting is separate and unchanged.
- Phones: the Popup fills the width inside the safe areas (`env(safe-area-inset-*)`, the project's `--bottom-inset`), the backdrop covers the status bar, `100dvh`; vertical swipe closes, horizontal navigates; buttons are 44px; Back closes; pinch-zoom is the browser's.
- iOS taps: the face's button handles `click` only, no hover timers; long-press on cards still selects.
- Forced colors: the backdrop and buttons use system colors; the focus ring is the browser's.

### Shared folder page and the demo

- `SharedFolderList` registers its loaded media pearls as pages arrive and mounts the same `MediaViewer`. Visitors reach the file itself through the browser's own long-press or right-click on the media. `?pearl=<id>` works for any pearl in the loaded list; the Open Graph preview stays the folder's; the Atom feed is unchanged.
- The landing demo registers nothing and renders no viewer; its media pearls keep opening in a new tab, and `/` ignores `?pearl`.
- Nothing new reaches the server; the only fetch is the existing session-only single-link route for an unknown `?pearl=` on the owner's pages.

## Files

New: `src/lib/media-viewer.ts`, `src/lib/media-viewer-url.ts`, `src/lib/viewer-drag.ts`, `src/components/media-viewer.tsx` (and its `next/dynamic` loader), tests beside them, `e2e/media-viewer.spec.ts`.

Changed: `package.json` (`cambio`), `src/lib/motion-features.ts` (`domMax`), the root layout's wrapper (`isolation: isolate`, Cambio's portal requirement), `src/components/media-card-face.tsx` (the `m.div layoutId` wrappers), `src/components/link-card.tsx`, `src/components/shared-link-card.tsx`, `src/components/link-item.tsx`, `src/components/shared-link-item.tsx`, `src/components/link-icon.tsx` (the row preview's `layoutId`), `src/hooks/use-live-cards.ts` and `src/hooks/use-audio-player.ts` (the hand-off), `src/components/home-shell.tsx` and `src/components/shared-folder-list.tsx` (registration, the viewer, `?pearl=`), `CLAUDE.md`.

## Testing

**Unit (Vitest):** `media-viewer.test.ts` (register keeps order and drops removed ids; open sets both ids; next/prev clamp; removing the current pearl moves or closes; `useIsMediaOpen`); `media-viewer-url.test.ts` (push on open, replace on navigation, back when pushed else strip, `popstate` closes, `?settings=` untouched); `viewer-drag.test.ts` (axis lock and the 80px / 400px/s thresholds as a pure function of offset and velocity).

**e2e (`e2e/media-viewer.spec.ts`):** a click on an image card opens a dialog named after the pearl with the image inside and `?pearl=` in the URL; → moves to the next (live region "2 of 3: …", URL replaced); Esc closes and focus returns to the current card's button; a list row opens the same viewer; the shared page opens and navigates; a video pearl's viewer holds `<video controls>` and the card's loop is paused meanwhile; under reduced motion the viewer opens and the video has no autoplay; on the phone profile Back closes the viewer and the buttons are 44px; a `?pearl=<id>` load opens on that pearl.

**By hand:** the morph itself and the swipe physics, on desktop and a phone.

## Delivery order

One branch, in order:

1. `cambio`, `domMax`, the store and URL helpers with tests, `MediaViewer` with images only, the owner's grid cards as triggers (the morph lands with the first PR).
2. Video and audio in the viewer, the playback hand-off, list rows, the shared page.
3. Navigation: buttons, keys, swipe, preloading, the live region, phones.
4. CLAUDE.md "Media viewer" bullets; closes the parked note from the uploads spec about audio controls inside the shared card's link.

## Risks and assumptions

- **Changing the Root's `layoutId` while open** (the close target after navigation) relies on Motion re-registering the id on a mounted element. If it misbehaves, the fallback is a plain fade on close after navigation; open always morphs.
- **Cambio bundles `motion` as a dependency, not a peer** (`^12.23`; the app has `^12.38`): pnpm should dedupe to one copy; checked after install. It also imports Motion's full `motion` components inside its chunk, which is why the viewer is loaded on demand.
- **Base UI beside Radix:** one more primitives library, tree-shaken to the Dialog. Cambio is small enough to vendor if it stalls (one maintainer, v1.1.5, August 2025).
- **Video morph quality:** a playing `<video>` isn't morphed; the poster is, then the player appears. On a video link with no poster the current frame of the paused card is the start rect's content.
- **Virtualised or unmounted targets:** rows use `content-visibility: auto`; a target off-screen may have no box, so the close falls back to a fade. Accepted.
