# Media Uploads and Embeds — Design

## Problem

A pearl is a saved URL: a page, a PDF, a YouTube video, an audio file. People who collect visual references (UI screenshots, motion clips, live demos, sounds) can't keep them in Purl: a screenshot on the desktop has no URL, a direct video URL renders as a page card, and a deployed prototype shows only its Open Graph image.

**Goal:** folders become moodboards. An uploaded image, video or audio file is a pearl like any link; a direct media URL renders as its media; and a page that allows framing can be shown live, in the grid and in a lightbox, the way Vayo's "UI" board shows GIFs, clips and a running demo side by side. Everything a pearl already has (folders, sharing, selection, bulk move and delete, search, the Atom feed, the landing demo, the API and MCP) keeps working without new code paths.

## Decisions

Settled with the user during brainstorming:

- **Outcome: visual moodboards.** Media is shown full-bleed in the grid, videos play muted inline, boards are shareable at `/@username/slug`. Uploads and media links are first-class pearls.
- **Media as pearls (approach A).** One `Link` row per upload or media link, with new nullable columns. A separate upload model was rejected (every list, the selection bar, moves, the public page, the feed and the MCP resources would need a union type). Uploading through a Purl route was rejected (Vercel caps request bodies at 4.5 MB).
- **Storage: Vercel Blob**, a public store (unguessable URLs, like Notion or Are.na). A file is as private as its URL; deleting the pearl deletes the file. A private store was rejected: every view would stream through a signed-in function, and sharing a folder would have to re-sign its files.
- **Quota: 250 MB per account, 25 MB per file**, built as a per-user entitlement because subscription plans will raise it later. Every account gets the same number today.
- **An upload is one pearl against the 1,000-pearl cap**, plus the storage cap.
- **Embeds are opt-in per pearl** ("Show live"): any URL whose page allows framing can be switched on; known players (YouTube, Vimeo, Loom, Figma, CodePen, X posts) are live by default. Live in the grid behind a click-to-interact gate, thumbnail-only on phones, large in the lightbox. Rendering every frameable save as an iframe was rejected (most saves are articles); live-only-in-the-lightbox was rejected (loses the board feel). An open-ended oEmbed renderer was rejected (third-party HTML in the page).
- **Media links** (direct image, video and audio URLs) render inline. No upload, no quota.
- **Entry points, all in the first release:** drag and drop onto the page, paste from the clipboard, the + menu's "Upload files" (the only way on touch), and the installed app as a share target (Android and desktop Chrome; iOS doesn't offer installed web apps as share targets).
- **Thumbnails are made in the browser at upload time** (the decoded image or the video's first frame, as a WebP preview beside the original). No image service, no per-image billing.

Out of scope: uploads through the v1 API, MCP or the browser extension (they save URLs; a media URL works through them already); an audio waveform; cropping or editing media; per-pearl aspect ratio for embeds; a storage cap higher than the flat one (plans come later); HEIC handling (iOS converts to JPEG when picking from Photos); the share target on iOS; a "download all" or export.

## Data model

One additive migration (`prisma/migrations/<stamp>_media_uploads_embeds`):

```prisma
enum ContentType {
  WEB
  YOUTUBE
  PDF
  AUDIO
  IMAGE   // new
  VIDEO   // new
}

model Link {
  // ...existing fields...
  /// Blob pathname of an uploaded file; null for links. "Is an upload" is `fileKey !== null`.
  fileKey    String?
  /// Size of the uploaded file in bytes (the storage quota sums it).
  fileSize   Int?
  /// MIME type of an upload or a media link (the player and Accept checks).
  mimeType   String?
  /// Pixel size of an image or video, when known (the grid reserves the card's shape).
  width      Int?
  height     Int?
  /// Length of a video or audio upload in whole seconds (the duration pill).
  duration   Int?
  /// Whether the page allows being framed (from its headers at save); null = unknown or not a page.
  frameable  Boolean?
  /// Owner's choice: show the page live in an iframe ("Show live").
  embed      Boolean  @default(false)

  @@index([userId, fileKey])
}
```

`AUDIO` covers audio links and audio uploads alike. `thumbnail` (existing) holds the preview's URL for an upload, exactly as it holds a page's Open Graph image today. The `Link` type in `src/utils/links.ts`, the API and MCP shapes, the public folder's fields and the demo's links carry the new fields (`fileKey` is exposed as `upload: boolean`, never the pathname).

**Blob paths.** `users/<userId>/<cuid>/<original name>` for the file and `users/<userId>/<cuid>/preview.webp` for its preview, both uploaded with Blob's random suffix so URLs are unguessable. The user id in the path lets the server check ownership from a URL alone and lets the sweep and account deletion list one account's files. The original name is sanitized to `[A-Za-z0-9._-]`, cut to 120 characters, and its extension is replaced by the one the MIME type implies.

**Upload metadata.** Title: the file name without its extension (the edit dialog edits it as for any pearl). Domain: Purl's own host (`BASE_URL`'s host; the Blob host would read as noise). Favicon: `/icon.png`. Description: null. Content type from the MIME type (`image/*` → IMAGE, `video/*` → VIDEO, `audio/*` → AUDIO). `frameable` and `embed` stay null/false: an upload is never framed.

## Limits and entitlements

`src/lib/limits.ts`:

```ts
/** Largest single upload. */
export const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;
/** Storage every account gets today; plans will raise it (read it through getStorageCapForUser). */
export const MAX_UPLOAD_BYTES_PER_ACCOUNT = 250 * 1024 * 1024;
/** Uploads a page runs at once. */
export const MAX_CONCURRENT_UPLOADS = 3;
```

`src/lib/entitlements.ts`:

- `getStorageCapForUser(userId): Promise<number>` returns `MAX_UPLOAD_BYTES_PER_ACCOUNT` for everyone. It is the one place a plan changes.
- `getStorageUsedForUser(userId, tx?)`: `SUM(fileSize)` over the user's links (at most 1,000 rows; no counter column).
- `StorageLimitError` (`feature: "STORAGE_LIMIT"`) beside `SaveLimitError`. Both extend a shared `LimitError` base, so the `instanceof SaveLimitError` checks in `POST /api/links` and MCP's `save_link` become one `instanceof LimitError` check answering `403 { code: "LIMIT_REACHED", feature }`. Message: "Your 250 MB of storage is full. Delete files you no longer need to upload more."
- `insertWithinSaveLimit` takes an optional `bytes`: under the same advisory lock it checks `used + bytes <= cap` after the link-count check, so two uploads at the edge can't both land.

Settings → Usage: `getUsageSummaryForUser` returns `{ saves, storage: { used, cap } }`; `SettingsUsage` draws a second `UsageItem`, "Storage", as "120 MB of 250 MB" (`formatBytes` in `src/utils/formatter.ts`: MB with no decimals above 10 MB, one decimal below, KB below 1 MB).

## Upload pipeline

No file bytes pass through a Purl function and there is no `onUploadCompleted` webhook (it can't reach localhost), so the flow is identical in dev and production.

1. **Validate in the browser** (`src/lib/uploads/validate.ts`, pure): the MIME type must be in `UPLOAD_MIME_TYPES` (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `image/svg+xml`; `video/mp4`, `video/webm`, `video/quicktime`; `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/ogg`, `audio/flac`) and the size at most `MAX_UPLOAD_FILE_BYTES`. A file the browser reports with an empty type is typed from its extension (`extensionToMime`). Rejected files toast at once ("photo.heic isn't a supported file", "clip.mov is over 25 MB"); the rest continue.
2. **Make the preview** (`src/lib/uploads/preview.ts`, browser only): images decode with `createImageBitmap`, draw to a canvas scaled to fit 1,280 px on the long side, and export as WebP at quality 0.82. A GIF keeps its original as the preview (a canvas would freeze it) and the preview upload is skipped; an SVG is drawn to a canvas like any image (rendering through `<img>` never runs its scripts). Videos load in a muted `<video>` (`preload="metadata"`), seek to 0.1 s and capture that frame the same way; width, height and duration come from the element. Audio has no preview; duration comes from an `<audio>` element. Step 2 runs with at most two decodes at once; a preview that fails (an unsupported codec) is skipped and the card falls back to the kind's face.
3. **Get a token:** `POST /api/uploads/token` with `{ name, mimeType, size, preview: boolean }`. The route (`src/app/api/uploads/token/route.ts`) needs a browser session, checks the type against the allowlist, `size <= MAX_UPLOAD_FILE_BYTES`, `assertCanSaveLink` and `used + size <= cap`, then answers with `@vercel/blob/client`'s `handleUpload` token for the pathname prefix `users/<userId>/<cuid>/`, with `maximumSizeInBytes` and `allowedContentTypes` set to the declared file (and the preview's `image/webp`), `addRandomSuffix: true`, and a 10-minute validity. It is rate-limited in the proxy like `POST /api/links` (`links_post`). With no `BLOB_READ_WRITE_TOKEN` it answers `503 { code: "UPLOADS_UNAVAILABLE" }`.
4. **Upload** the original and the preview straight to Blob with `upload()` from `@vercel/blob/client`, `onUploadProgress` feeding the pending card. Up to `MAX_CONCURRENT_UPLOADS` files run at once; the rest queue in drop order.
5. **Create the row:** `POST /api/links` with `{ upload: { url, previewUrl, mimeType, width, height, duration }, folderId }` in place of `url` (one body shape, `upload` and `url` mutually exclusive). `createUploadForUser` (`src/lib/uploads.ts`, server) checks both URLs are on the Blob host under `users/<userId>/`, confirms the original with `head(url)` (its real `size` and `contentType`; never the client's numbers), rejects a mismatch with `400 INVALID_UPLOAD`, then inserts under `insertWithinSaveLimit(userId, insert, { bytes: size })`. A failed insert (cap, limit, database) deletes both blobs before answering. The response is the pearl, like a link save, and `broadcastLinksChanged` runs as for any save.

Step 5 is the only step that writes to the database. A tab closed between 4 and 5 leaves orphan blobs, which the sweep removes.

## Entry points

All end in one `uploadFiles(files, { folderId, onStart, onProgress, onDone, onError })` from `src/lib/save-uploads.ts`, shaped like `saveLinks`, run from `HomeShell` so the pending items sit in the list.

- **Drop:** `DropHandler` (`src/components/drop-handler.tsx`) beside `PasteHandler` on Home and folder pages. `dragenter` with files on the window shows a full-page overlay, "Drop to save" or "Drop to save to 📚 Reading", that fades in 150 ms (none under reduced motion); `drop` uploads the files. A drop with no files but a URL or text goes through the existing paste flow (`parsePastedUrls`). While the Settings dialog is open the handler ignores drags, so the Import tab's own drop zone keeps its behaviour. Folders and non-files are refused with a toast.
- **Paste:** `PasteHandler` reads `clipboardData.files` before `getData("text")`; files upload, text saves as today. A paste with both uploads the files only (browsers put a placeholder name as the text).
- **+ menu → "Upload files":** `HeaderAddMenu` gains the item (icon `Upload`) above "Add links", shortcut `U` (not while typing or with an overlay open, same guard as `A`), opening a hidden `<input type="file" multiple accept="<UPLOAD_MIME_TYPES>">`; on phones the picker opens the camera roll. In the landing demo the item is disabled like Paste link. The folder empty state gets a second line, "or drop files here".
- **Share target:** `public/manifest.json` gains `share_target: { action: "/share", method: "POST", enctype: "multipart/form-data", params: { title: "title", text: "text", url: "url", files: [{ name: "media", accept: [<UPLOAD_MIME_TYPES>] }] } }`. The service worker (`src/app/sw.ts`) intercepts `POST /share`, stores the files in the `purl-shared` cache keyed by a nonce, and answers a 303 to `/home?shared=<nonce>`. `HomeShell` reads the param, pulls the files from the cache, deletes them and runs `uploadFiles`; a shared `url` or `text` goes through the save flow. Without a service worker (dev) `POST /share` reaches a route that answers 303 to `/home` and the files are lost, so the spec says: test it with `pnpm build && pnpm start`.

**While uploading:** each file is a `PendingUpload` (`src/lib/pending-upload.ts`: `{ id, name, kind, previewUrl (an object URL), progress: 0..1, status: "uploading" | "failed" }`) in `HomeShell`'s `pendingUploads` list, beside `pendingSave`. The grid shows `PendingUploadCard` (the local preview at its ratio with a progress ring in the corner, the kind's face for audio); the list shows `PendingUploadRow` (the preview in the favicon slot, the name, progress on the right where "2/8" sits). They sit at the top of today, in drop order, and the finished pearl arrives in that slot through the FLIP machinery `HomeShell` already has (`glide()`). One `role="status"` says "Uploading 3 files"; progress isn't read aloud per tick. A failed upload keeps its item with "Retry" and "Dismiss"; a failure doesn't stop the rest; the storage cap stops the rest with one toast. Object URLs are revoked when the item leaves.

## Rendering

**Grid cards** (`LinkCardContent`, shared by the owner's and the public grid; `src/lib/link-kind.ts`: `linkKind(link)` → `"image" | "video" | "audio" | "embed" | "page"`):

- **Image and video** (uploads and media links): media only, full-bleed at its own aspect ratio, no favicon/title/domain strip. The box is sized with `aspect-ratio: width / height` when known, so the masonry never shifts; a media link without them uses 16:10 until it loads, then its natural ratio (the masonry's `ResizeObserver` re-places on that). Ratios are clamped between 1:3 and 3:1. Images load the preview (`thumbnail`), and the original only when there is no preview (a media link). Videos render `<video muted loop playsinline preload="metadata" poster={thumbnail}>` with the file as source and play while in view (`useInView`, an `IntersectionObserver`; `MAX_LIVE_CARDS` = 6 playing at once, the rest wait on their poster), paused when they leave. Under reduced motion they stay on their poster and play on hover. A duration pill ("0:14", `formatDuration`) sits in the bottom-right corner over a scrim. The card's `aria-label` is the title (an image pearl has no visible text).
- **Audio:** the kind's face: a player strip (play/pause, elapsed over duration, a native-range scrubber) on the card's tint (`bg-muted`), then the usual title and domain under it. `useAudioPlayer` keeps one playing at a time across cards, rows and the lightbox.
- **Embed** (`embed: true`): `EmbedFrame` in the thumbnail slot at 16:10, then the favicon/title/domain strip. See Embeds.
- **Page, PDF, YouTube without embed:** today's card, unchanged.

The owner's affordances (checkbox, ⋯, folder badge, selection, long-press, Undo fades, FLIP) are the card's frame and don't change. The checkbox and ⋯ sit over the media on a scrim, as they do over thumbnails.

**List rows** (`LinkItem`, `SharedLinkItem`): an image row's `LinkIcon` is its preview as a 20/24 px rounded square; video rows show Reicon `Video`, audio `MusicNote` (exists), embed rows the favicon. The hover preview (`LinkPreview`) shows the media: the image, a video's poster with the duration pill, the audio strip; embeds keep the page thumbnail.

**Opening.** Page links open in a new tab as today. Image, video, audio and embed pearls open the **lightbox** (`src/components/media-lightbox.tsx`, a Radix `Dialog`, `next/dynamic`, prefetched after hydration): the original image fit to the viewport (`object-contain`), a video or audio with native `controls` (the grid's muted loop pauses), or the embed at the viewport minus 32 px margins. Title and domain under it; "Open original" (the file or the page, new tab) and the row menu's items (Copy, Edit, Move, Delete) in its bar. ← and → move between the folder's media and embed pearls in display order (the list `HomeShell` registers for selection, filtered by kind), Esc closes, swipe on touch. `isOverlayOpen` already covers it (`data-scroll-locked`). The same lightbox serves the shared folder page, without the owner's items.

**Shared folders:** `PublicFolderLink` and `GET /api/public/folders/...` add `mimeType`, `width`, `height`, `duration`, `embed`, `upload`. Cards, rows and the lightbox are the same components. `buildAtomFeed` gives an upload an `<link rel="enclosure" type="<mime>" length="<fileSize>">` beside its `alternate`. The folder's Open Graph image uses the preview for uploads; a video or audio card without one shows the kind's icon on the tint.

**Landing demo:** `@purl`'s media pearls render through the same components; the demo's `LinkCard` opens the lightbox (read-only) instead of a new tab for media; embeds stay thumbnails in the demo (no live iframes on the landing page).

**Media links.** `detectContentTypeFromUrlRules` gains `isImageUrl` (`.jpg .jpeg .png .gif .webp .avif .svg`) and `isVideoUrl` (`.mp4 .webm .mov .m4v`) in `src/utils/`, and the HEAD sniff maps `image/*` → IMAGE and `video/*` → VIDEO. `scrapeLinkMetadata` for IMAGE and VIDEO skips the Open Graph fetch: title from the path's file name (decoded, without extension; the domain when empty), thumbnail = the URL for images (`safeRemoteImgSrc`), none for video and audio, favicon the site's default, `mimeType` from the sniff. `enrichFlaggedLinks` handles the new types through the same resolver. `guessContentType` (import) gains the same extension rules.

## Embeds

**Detection at save** (`src/lib/frameable.ts`, pure over headers; wired in `scrapeLinkMetadata` for WEB and PDF pages, which already fetch the page): `isFrameable(headers, origin)`:

- `X-Frame-Options` present with any value (`DENY`, `SAMEORIGIN`, `ALLOW-FROM …`) → `false`.
- `Content-Security-Policy` (every header value, comma-joined) with a `frame-ancestors` directive → `true` only if its sources include `*`, `https:` or Purl's origin (`BASE_URL`); otherwise `false`. `'none'` → `false`.
- Neither header → `true`.
- No response (fetch failed, timed out, non-HTML) → `null`.

Only headers count: browsers ignore `frame-ancestors` in a `<meta>` tag. `resolveLinkFromUrl` returns `frameable`; create, update (URL change) and the enrich cron store it; the preview endpoint returns it too.

**Known players** (`src/lib/embeds.ts`, pure): `getEmbedUrl(url): string | null`.

| Provider | Page URL | Embed URL |
|---|---|---|
| YouTube | `youtube.com/watch?v=`, `youtu.be/`, `/shorts/` | `https://www.youtube-nocookie.com/embed/<id>` (`getYouTubeEmbedUrl`, exists) |
| Vimeo | `vimeo.com/<id>` | `https://player.vimeo.com/video/<id>?dnt=1` |
| Loom | `loom.com/share/<id>` | `https://www.loom.com/embed/<id>` |
| Figma | `figma.com/(file|design|proto|board)/…` | `https://www.figma.com/embed?embed_host=purl&url=<encoded page URL>` |
| CodePen | `codepen.io/<user>/pen/<id>` | `https://codepen.io/<user>/embed/<id>?default-tab=result` |
| X | `x.com/<user>/status/<id>`, `twitter.com/…` | `https://platform.twitter.com/embed/Tweet.html?id=<id>&dnt=true` |

A known player saves with `embed: true` and `frameable: true`, skipping the header check (the embed URL frames by design). Any other frameable URL embeds as itself. `embedSrc(link)` = `getEmbedUrl(link.url) ?? link.url`.

**`EmbedFrame`** (`src/components/embed-frame.tsx`, one component for card and lightbox):

```html
<iframe src={embedSrc} title={link.title} loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="strict-origin-when-cross-origin"
  allow="autoplay; fullscreen; clipboard-write; picture-in-picture" />
```

No `allow-top-navigation`: a framed page can't steer Purl away. Card behaviour: the card shows the page thumbnail until it is in view, then mounts the iframe (at most `MAX_LIVE_CARDS` = 6 live across embeds and playing videos; cards that scroll more than two viewports away unmount theirs). The iframe starts under a transparent cover (`pointer-events` go to the cover), so wheel and drag scroll the grid; a click or Enter on the cover makes it live (the cover hides, a `ring-2` shows, the row's selection and long-press are off meanwhile), until Esc, a click outside or scrolling it out of view. On touch (`pointer: coarse`) the card keeps the thumbnail with a "Live" pill and the lightbox holds the iframe. An iframe whose `load` hasn't fired in 8 s shows "Couldn't load this page" over the thumbnail with "Open in new tab" (a refusing page fires `load` on its error document, so this catches only a dead host; a refusing page is prevented upstream by `frameable`).

**CSP** (`src/lib/csp-header.ts`): `frame-src 'self' https: https://vercel.live https://*.vercel.live` and an explicit `media-src 'self' blob: https: http:`. Nothing else widens; the sandbox, not the CSP, bounds a framed page. `safeRemoteImgSrc` already accepts any https URL, and the service worker's cross-origin `NetworkOnly` rule covers the Blob host.

**Owner's switch:** "Show live" is a checkbox item drawn with a switch in the row and card menu (the `FolderTagsMenuItem` pattern) and a checkbox in the edit dialog, shown for WEB, PDF and YOUTUBE pearls; disabled with "This site doesn't allow embedding" when `frameable` is false and "Couldn't check this site" when null (uploads and media don't show it). `PATCH /api/links/[id]` (app and v1) accept `embed: boolean`, rejecting `true` with `400 NOT_FRAMEABLE` when `frameable` is false or null and the URL isn't a known player. Turning it on reloads the card's face in place (`notifyLinksChanged`).

## Deletion and cleanup

Every way a row dies also removes its blobs, best-effort and after the database commit (a blob that outlives its row is harmless and swept; a row without its blob is a broken card). `deleteBlobsFor(links)` in `src/lib/uploads.ts` collects `fileKey` URLs and upload previews and calls `del(urls)` once; a failure is logged (`[uploads] del failed …`) and never fails the user's action.

- `deleteLink` and `deleteLinksForUser` (row menu, selection bar, bulk endpoints, MCP `delete_link`): select the doomed rows' URLs first, delete, then `deleteBlobsFor`. The 5 s Undo delay means a delete reaches the server only once it's final.
- `deleteFolder` with `withLinks`: selects inside the transaction, deletes blobs after it commits.
- Account deletion: a Better Auth `deleteUser.beforeDelete` hook in `src/lib/auth.ts` deletes everything under `users/<userId>/` by listing the prefix (`list({ prefix })`, paginated), before the cascade.
- A failed row insert after an upload deletes the fresh blobs. An upload's URL isn't editable (the edit dialog hides the URL field for uploads; `PATCH` with `url` on an upload is `400 INVALID_UPLOAD`).

**The sweep:** `GET /api/cron/sweep-uploads` (daily, `0 4 * * *` in `vercel.json`; `CRON_SECRET` like the enrich cron, 503 without it, 401 on a bad header; `maxDuration = 120`). `sweepOrphanUploads` (`src/lib/sweep-uploads.ts`) lists the store page by page (`list({ prefix: "users/", cursor })`), keeps pathnames whose `uploadedAt` is over 24 h old, looks up which URLs a link references by `fileKey` or `thumbnail` (one `findMany` per page), deletes the rest in one `del` per page, and stops after `SWEEP_BUDGET` = 500 deletions so a backlog drains over days. It answers `{ listed, deleted, stopped }`. Dev triggers it with curl like the enrich cron.

## Environments and setup

- One Blob store per environment: `purl` connected to Production, `purl-dev` to Preview and local. `BLOB_READ_WRITE_TOKEN` is server-only (the browser gets short-lived client tokens); `.env.local` takes it from `vercel env pull`, `.env.example` documents it. Local e2e (`.env.e2e`) points at the dev store too, or leaves it unset to skip the upload specs.
- Without the token, `POST /api/uploads/token` answers 503, the + menu's item, the drop overlay and file paste are hidden (`uploadsEnabled` from the `(app)` layout), and the share target redirects with a toast "Uploads aren't available here".
- New dependency: `@vercel/blob`. No change to `next.config.ts` images (previews are plain `<img>` like today's thumbnails).

## API and MCP

- `POST /api/links` accepts `{ upload }` (browser session only; v1 and the save-only scope reject it with `400 UPLOADS_APP_ONLY`). Responses everywhere carry the new fields (`upload`, `mimeType`, `width`, `height`, `duration`, `frameable`, `embed`).
- `PATCH /api/links/[id]`, `/api/v1/links/[id]`: `embed`. The bulk `PATCH` doesn't take it.
- `GET /api/links/preview` returns `frameable` and the new content types.
- MCP: `list_saved_items` and the resources include the new fields; `save_link` of a media URL works unchanged; no upload tool.
- `/docs/api` and `/docs/mcp` (Notion) get the new fields documented once they ship (content, not code).

## Files

New: `src/lib/uploads.ts`, `src/lib/uploads/validate.ts`, `src/lib/uploads/preview.ts`, `src/lib/save-uploads.ts`, `src/lib/pending-upload.ts`, `src/lib/link-kind.ts`, `src/lib/frameable.ts`, `src/lib/embeds.ts`, `src/lib/sweep-uploads.ts`, `src/utils/image.ts`, `src/utils/video.ts`, `src/app/api/uploads/token/route.ts`, `src/app/api/cron/sweep-uploads/route.ts`, `src/app/share/route.ts`, `src/components/drop-handler.tsx`, `src/components/embed-frame.tsx`, `src/components/media-lightbox.tsx`, `src/components/media-card-face.tsx` (image, video, audio faces), `src/components/skeletons/pending-upload.tsx`, `src/hooks/use-in-view.ts`, `src/hooks/use-audio-player.ts`, the migration, and the tests and e2e specs below.

Changed: `prisma/schema.prisma`, `src/lib/limits.ts`, `src/lib/entitlements.ts`, `src/lib/usage-summary.ts`, `src/lib/links.ts`, `src/lib/public-folders.ts`, `src/lib/atom-feed.ts`, `src/lib/csp-header.ts`, `src/lib/auth.ts`, `src/lib/folders.ts`, `src/lib/enrich-links.ts`, `src/lib/guess-content-type.ts`, `src/lib/mcp.ts`, `src/lib/mcp-resources.ts`, `src/utils/links.ts`, `src/utils/link-content-type-shared.ts`, `src/proxy.ts`, `src/app/sw.ts`, `public/manifest.json`, `vercel.json`, `.env.example`, `src/components/{home-shell,paste-handler,header-add-menu,link-card,shared-link-card,link-item,shared-link-item,link-icon,link-preview,link-menu,dialog-edit-link,settings-usage,link-group,shared-folder-list}.tsx`, the links API routes (app, v1, public), `CLAUDE.md`.

## Testing

**Unit (Vitest):**

- `embeds.test.ts`: every provider's URL forms map to the right embed URL; page and unknown URLs return null.
- `frameable.test.ts`: `X-Frame-Options` values, `frame-ancestors` lists (`*`, `https:`, Purl's origin, another origin, `'none'`), several CSP headers, no headers, no response → null.
- `uploads.test.ts`: `createUploadForUser` rejects URLs off the Blob host or another user's prefix, a `head()` size or type mismatch, a disallowed type; deletes blobs on a failed insert; the token route rejects a bad type, an oversized file, a full account and a hit link cap, each with its code, and answers 503 without the token.
- `entitlements.test.ts` grows: the storage sum under the lock, `getStorageCapForUser`, `bytes` on `insertWithinSaveLimit`.
- `validate.test.ts`: the allowlist, size, extension-to-MIME fallback.
- `link-content-type-shared.test.ts` grows: image and video extensions and sniffs; `links.test.ts`: media-link metadata (title from the path, thumbnail for images only).
- `sweep-uploads.test.ts`: orphans deleted, referenced and fresh blobs kept, the budget stops the run, the response counts.
- `links-crud.test.ts`, `folders.test.ts`, `auth-hooks.test.ts`: delete paths call `del` with the right URLs and swallow its failure.
- `preview.test.ts`: the fit-to-1,280 sizing math (the canvas itself is browser-only).
- `csp-header.test.ts` grows: `frame-src` and `media-src`.
- `atom-feed.test.ts`: the enclosure.

**e2e (Playwright):** `e2e/uploads.spec.ts` (drop, paste, + menu, pending card to real card, Usage line, delete removes it from the grid and the store), `e2e/media-lightbox.spec.ts` (open, ← →, Esc, shared folder), `e2e/embeds.spec.ts` (a local route that sends `X-Frame-Options` makes the switch disabled; a frameable local page gets the iframe gated until click; thumbnail only on the phone project). Upload specs skip without `BLOB_READ_WRITE_TOKEN` in `.env.e2e` and delete what they upload. The share target can't be driven by Playwright; it is checked by hand on Android after `pnpm build && pnpm start`.

## Delivery order

One branch per step, each shipping alone:

1. Schema, limits, entitlements, Usage line, media-link detection and metadata, the media faces in grid and rows (media links work with no uploads yet).
2. Upload pipeline: token route, `createUploadForUser`, + menu, drop, paste, pending cards and rows, delete paths, the sweep cron, environments.
3. Lightbox, shared folder fields, feed enclosure, OG image.
4. Embeds: `frameable` detection, providers, the switch, `EmbedFrame`, CSP, `PATCH embed`.
5. Share target.

`CLAUDE.md` gets a "Media and embeds" section in the folders' style with each step; `public/llms.txt` and the landing copy mention files and embeds once step 2 ships.

## Risks and assumptions

- **Blob egress.** Previews are at most 1,280 px WebP, so a board of a hundred images is a few MB; originals load only in the lightbox. Video cards stream the original (`preload="metadata"` until in view); a board of many 25 MB clips is the heaviest case and the six-at-once cap bounds it.
- **`head()` and the random suffix.** The row insert trusts Blob's own metadata, not the client's; the server never generates the pathname the client uploads to, only the prefix, which the token pins.
- **`frameable` can go stale** (a site adds `X-Frame-Options` later): the card then shows a blank frame. The 8 s load timeout doesn't catch it (a refusal still fires `load`). Accepted; the owner can switch it off, and the enrich cron re-reading headers on demand is a later improvement.
- **Share target on iOS** is unsupported by the platform and stated as such; the manifest entry is harmless there.
- **Safari and `video/quicktime`:** an H.264 `.mov` plays in Safari and Chrome; a HEVC `.mov` from an iPhone plays in Safari only. The card shows the poster and the lightbox's native controls show the browser's own error. Accepted; a transcoding step is out of scope.
- **`allow-same-origin` with `allow-scripts`** in the sandbox is safe for cross-origin pages (they keep their own origin, not Purl's); `embedSrc` is never same-origin, enforced by refusing `embed: true` for `BASE_URL` URLs.
- **A 25 MB client token** is issued per file and expires in 10 minutes; a slow connection that can't finish a 25 MB upload in 10 minutes fails and retries with a new token.
