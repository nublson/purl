# Media Pearls and Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Image, video and audio files become pearls: direct media URLs render as their media in the grid and rows, and files upload from the browser to Vercel Blob with a storage quota, pending cards, deletion and an orphan sweep.

**Architecture:** One `Link` row per media pearl, with new nullable columns, so every existing list, folder, selection, sharing and API path carries media unchanged. Files go straight from the browser to Vercel Blob with a short-lived token from a Purl route; the row is created afterwards from Blob's own metadata. Previews are made in the browser. Deletion is best-effort after each database delete, with a daily cron sweeping orphans.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Vercel Blob (`@vercel/blob` 2.8.2, `@vercel/blob/client`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-media-uploads-embeds-design.md`. This plan implements its delivery steps 1 and 2 (media links and the grid faces; the upload pipeline, entry points except the share target, deletes, the sweep). The lightbox, embeds and the share target are later plans.

## Global Constraints

- Icons come from `reicon-react` with named imports; never `lucide-react`, never a namespace import (ESLint rejects both).
- Every outbound HTTP request in server code goes through `safeFetch` (`src/lib/safe-outbound-fetch.ts`); `@vercel/blob`'s own calls to Vercel are the one exception.
- The migration is additive only: new nullable columns and enum values, no drops or type changes.
- Copy is verbatim from the spec: "Your 250 MB of storage is full. Delete files you no longer need to upload more.", "photo.heic isn't a supported file", "clip.mov is over 25 MB", "Uploading 3 files", "Drop to save", "Drop to save to 📚 Reading", "Upload files", "or drop files here", "Uploads aren't available here".
- Constants: `MAX_UPLOAD_FILE_BYTES` = 25 × 1024 × 1024, `MAX_UPLOAD_BYTES_PER_ACCOUNT` = 250 × 1024 × 1024, `MAX_CONCURRENT_UPLOADS` = 3, preview long side 1,280 px at WebP quality 0.82, `MAX_LIVE_CARDS` = 6, `SWEEP_BUDGET` = 500, sweep age 24 h, token validity 10 minutes.
- Limit errors answer `403 { error, code: "LIMIT_REACHED", feature }` with `feature` `"SAVE_LIMIT"` or `"STORAGE_LIMIT"`.
- Blob paths: `users/<userId>/<cuid>/<name>` and `users/<userId>/<cuid>/preview.webp`, `access: "public"`, `addRandomSuffix: true`. Blob URLs are on a host ending in `.public.blob.vercel-storage.com`.
- Upload metadata: title = file name without extension, domain = `BASE_URL`'s host, favicon = `/icon.png`, description null.
- Allowed MIME types (`UPLOAD_MIME_TYPES`): `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `image/svg+xml`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/ogg`, `audio/flac`.
- Commits: conventional subjects (`feat:`, `fix:`, `test:`, `docs:`), each ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Run `pnpm lint` and `pnpm typecheck` before each commit; `pnpm prisma generate` after the schema change.
- Tests: `pnpm vitest run <file>`; e2e `pnpm test:e2e <file>` (local database only, see CLAUDE.md).

## Review Focus

1. A duplicate upload (the same file twice) must create two pearls, never collapse: `createUploadForUser` must not use the `reuse` path keyed by URL (each blob URL is unique anyway), and the Usage count must rise by one each time. Test added to Task 10.
2. A file whose browser-reported `type` is empty (common for `.m4a`, `.flac`, `.mov` on Windows) must still upload with the type from its extension, not be rejected as unsupported. Test added to Task 8.
3. A row whose `fileKey` is set but whose `thumbnail` is null (an audio upload, a GIF, a failed preview) must render the kind's face, never a broken image. Test added to Task 7.
4. A delete whose `del()` call throws must still answer success and remove the row; the sweep must then remove the blob. Tests added to Tasks 12 and 13.
5. A `width`/`height` pair that is zero or absurd (a corrupt header) must not produce a zero-height card: the ratio is clamped between 1:3 and 3:1 and a zero falls back to 16:10. Test added to Task 7.

---

## File Structure

New files (one responsibility each):

| File | Responsibility |
|---|---|
| `prisma/migrations/20261027120000_media_uploads/migration.sql` | New enum values and columns |
| `src/utils/image.ts`, `src/utils/video.ts` | `isImageUrl`, `isVideoUrl` (URL rules, like `pdf.ts`) |
| `src/utils/media-title.ts` | `mediaTitleFromUrl` (file name without extension) |
| `src/utils/format-bytes.ts` | `formatBytes` for the Usage line |
| `src/utils/format-duration.ts` | `formatDuration` for the pill |
| `src/lib/link-kind.ts` | `linkKind(link)` and `cardAspectRatio(link)` |
| `src/lib/uploads/mime.ts` | `UPLOAD_MIME_TYPES`, `extensionToMime`, `contentTypeForMime`, `sanitizeUploadName` |
| `src/lib/uploads/validate.ts` | `validateUploadFile` (browser-side checks, pure) |
| `src/lib/uploads/preview.ts` | `fitWithin` (pure) and `makePreview` (browser only) |
| `src/lib/uploads/blob-url.ts` | `isBlobUrl`, `blobPathnameOf`, `isOwnBlobPathname` (pure) |
| `src/lib/uploads.ts` | Server: `createUploadForUser`, `deleteBlobsFor`, `deleteUserBlobs`, `uploadsEnabled` |
| `src/lib/upload-token.ts` | Server: `issueUploadToken` (the `handleUpload` wrapper) |
| `src/lib/save-uploads.ts` | Client: `uploadFiles` (the queue, token, upload, row) |
| `src/lib/pending-upload.ts` | `PendingUpload` type and the list helpers |
| `src/lib/sweep-uploads.ts` | `sweepOrphanUploads` |
| `src/app/api/uploads/token/route.ts` | `POST`: session, checks, token |
| `src/app/api/cron/sweep-uploads/route.ts` | Daily cron |
| `src/components/media-card-face.tsx` | `ImageFace`, `VideoFace`, `AudioFace` |
| `src/components/drop-handler.tsx` | Window drag-and-drop overlay |
| `src/components/upload-input.tsx` | Hidden file input and `openUploadPicker()` |
| `src/components/skeletons/pending-upload.tsx` | `PendingUploadCard`, `PendingUploadRow` |
| `src/hooks/use-audio-player.ts` | One audio playing at a time |
| `src/hooks/use-live-cards.ts` | At most `MAX_LIVE_CARDS` videos playing |

Modified: `prisma/schema.prisma`, `src/utils/links.ts`, `src/utils/link-content-type-shared.ts`, `src/lib/links.ts`, `src/lib/serialize-link.ts`, `src/lib/public-folders.ts`, `src/lib/demo-folders.ts`, `src/lib/limits.ts`, `src/lib/entitlements.ts`, `src/lib/usage-summary.ts`, `src/lib/guess-content-type.ts`, `src/lib/enrich-links.ts`, `src/lib/folders.ts`, `src/lib/auth.ts`, `src/lib/mcp.ts`, `src/lib/proxy-rate-limit.ts`, `src/lib/upstash-rate-limit.ts`, `src/lib/server-detect-content-type.ts`, `src/app/api/links/route.ts`, `src/app/api/links/[id]/route.ts`, `src/app/api/links/bulk/route.ts`, `src/components/usage-item.tsx`, `src/components/settings-usage.tsx`, `src/contexts/usage-context.tsx`, `src/components/shared-link-card.tsx`, `src/components/link-icon.tsx`, `src/components/link-preview.tsx`, `src/components/link-group.tsx`, `src/components/home-shell.tsx`, `src/components/paste-handler.tsx`, `src/components/header-add-menu.tsx`, `src/components/link-group-empty.tsx`, `src/components/dialog-edit-link.tsx`, `vercel.json`, `.env.example`, `e2e/support/db.ts`, `CLAUDE.md`.

---

## Part 1: media as pearls

### Task 1: Schema, `Link` type and serializers

**Files:**
- Create: `prisma/migrations/20261027120000_media_uploads/migration.sql`
- Modify: `prisma/schema.prisma:15-20` (enum), `:51-74` (model)
- Modify: `src/utils/links.ts:5-16`, `src/lib/links.ts:197-230` (`LinkRow`, `mapRowToLink`), `src/lib/serialize-link.ts:16-29`, `src/lib/public-folders.ts:13-23,51-61`, `src/lib/demo-folders.ts:60-70`, `e2e/support/db.ts:53-86`
- Test: `src/lib/serialize-link.test.ts`

**Interfaces:**
- Produces: `ContentType` adds `IMAGE`, `VIDEO`. `Link` (`src/utils/links.ts`) adds `mimeType: string | null`, `width: number | null`, `height: number | null`, `duration: number | null`, `frameable: boolean | null`, `embed: boolean`, `upload: boolean`. `serializeLink` emits the same seven fields. `PublicLink` and `PUBLIC_LINK_SELECT` add `mimeType`, `width`, `height`, `duration`, `embed`, `upload` (`upload` computed from `fileKey`, which is selected but never emitted). `seedLink` accepts `contentType` `IMAGE` / `VIDEO` and optional `thumbnail`, `mimeType`, `width`, `height`, `fileKey`, `fileSize`.

- [ ] **Step 1: Write the failing test** in `src/lib/serialize-link.test.ts`:

```ts
it("carries the media fields and derives upload from fileKey", () => {
  const out = serializeLink({ ...base, fileKey: "users/u1/c1/a.png", mimeType: "image/png", width: 800, height: 600, duration: null, frameable: null, embed: false });
  expect(out).toMatchObject({ upload: true, mimeType: "image/png", width: 800, height: 600, duration: null, frameable: null, embed: false });
});
it("defaults the media fields for a plain link", () => {
  expect(serializeLink(base)).toMatchObject({ upload: false, mimeType: null, width: null, height: null, duration: null, frameable: null, embed: false });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/serialize-link.test.ts` → FAIL (`upload` undefined).

- [ ] **Step 3: Migration SQL**: `ALTER TYPE "ContentType" ADD VALUE 'IMAGE'; ALTER TYPE "ContentType" ADD VALUE 'VIDEO';` then `ALTER TABLE "links" ADD COLUMN "fileKey" TEXT, ADD COLUMN "fileSize" INTEGER, ADD COLUMN "mimeType" TEXT, ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER, ADD COLUMN "duration" INTEGER, ADD COLUMN "frameable" BOOLEAN, ADD COLUMN "embed" BOOLEAN NOT NULL DEFAULT false;` and `CREATE INDEX "links_userId_fileKey_idx" ON "links"("userId", "fileKey");`. Mirror in `schema.prisma` with the spec's doc comments. Run `pnpm prisma generate`, then `pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` against the local database after `pnpm prisma migrate dev`.

- [ ] **Step 4: Types and mappers.** `Link` gains the seven fields. `LinkRow` gains `fileKey`, `mimeType`, `width`, `height`, `duration`, `frameable`, `embed` (all optional in the row type, defaulting to null/false in `mapRowToLink`; `upload = row.fileKey != null`). `serializeLink`'s `LinkLike` likewise; it never emits `fileKey` or `fileSize`. `PublicLink`, `PUBLIC_LINK_SELECT` (add `fileKey`, `mimeType`, `width`, `height`, `duration`, `embed`) and the mapping in `getPublicFolderPage` / `listPublicFolderLinks` and `demo-folders.ts` emit `upload` instead of `fileKey`. `seedLink` writes the new columns when given.

- [ ] **Step 5: Run** `pnpm vitest run src/lib/serialize-link.test.ts` → PASS; `pnpm typecheck` → clean (fix every site the new required `Link` fields break, e.g. test fixtures and `demo-links.ts`, by adding the defaults).

- [ ] **Step 6: Commit** `feat: media columns and content types on Link`.

### Task 2: Limits and the storage entitlement

**Files:**
- Modify: `src/lib/limits.ts`, `src/lib/entitlements.ts`, `src/app/api/links/route.ts:147-154`, `src/lib/mcp.ts:104-106`
- Test: `src/lib/entitlements.test.ts`

**Interfaces:**
- Produces: `MAX_UPLOAD_FILE_BYTES`, `MAX_UPLOAD_BYTES_PER_ACCOUNT`, `MAX_CONCURRENT_UPLOADS` in `limits.ts`. In `entitlements.ts`: `abstract class LimitError extends Error { readonly feature: "SAVE_LIMIT" | "STORAGE_LIMIT" }`, `SaveLimitError` and `StorageLimitError` extending it; `getStorageCapForUser(userId: string): Promise<number>`; `getStorageUsedForUser(userId: string, db?: Pick<Prisma.TransactionClient, "link">): Promise<number>` (`aggregate({ _sum: { fileSize } })`, null → 0); `assertCanStore(userId: string, bytes: number): Promise<void>` (pre-check, not race-safe); `insertWithinSaveLimit(userId, insert, { reuse?, bytes? })` checks `used + bytes <= cap` under the lock after the count check.

- [ ] **Step 1: Write the failing tests** in `entitlements.test.ts` (mock `prisma.link.aggregate` beside `count`):

```ts
it("getStorageCapForUser is the flat 250 MB", async () => { expect(await getStorageCapForUser("u1")).toBe(250 * 1024 * 1024); });
it("getStorageUsedForUser sums fileSize, null as 0", ...) // aggregate → { _sum: { fileSize: null } } → 0
it("insertWithinSaveLimit with bytes throws StorageLimitError when used + bytes exceeds the cap and never inserts", ...) // feature "STORAGE_LIMIT", message verbatim
it("insertWithinSaveLimit with bytes exactly filling the cap inserts", ...)
it("StorageLimitError and SaveLimitError are both LimitError", ...)
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/entitlements.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interfaces above; replace `instanceof SaveLimitError` in `POST /api/links` and MCP `save_link` with `instanceof LimitError`.
- [ ] **Step 4: Run** the file → PASS; `pnpm vitest run src/app/api/links` and `src/lib/mcp.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: storage quota entitlement`.

### Task 3: Usage line in Settings

**Files:**
- Create: `src/utils/format-bytes.ts`; Test: `src/utils/format-bytes.test.ts`
- Modify: `src/lib/usage-summary.ts`, `src/components/usage-item.tsx`, `src/components/settings-usage.tsx`, `src/contexts/usage-context.tsx:20-28`
- Test: `src/lib/usage-summary.test.ts` (create if missing)

**Interfaces:**
- Produces: `formatBytes(n: number): string` ("120 MB" at or above 10 MB, "2.5 MB" below, "640 KB" below 1 MB, "0 KB" for 0). `UsageSummary` / `UsageMeterData` = `{ saves: { used, cap }, storage: { used, cap } }`. `UsageItem` gains `format?: (n: number) => string` (default `toLocaleString`).

- [ ] **Step 1: Tests**: `formatBytes(0) === "0 KB"`, `formatBytes(640 * 1024) === "640 KB"`, `formatBytes(2.5 * 1024 * 1024) === "2.5 MB"`, `formatBytes(120 * 1024 * 1024) === "120 MB"`; `getUsageSummaryForUser` returns `storage.used` from the aggregate and `storage.cap` from `getStorageCapForUser`.
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement.** `SettingsUsage` renders `<UsageItem label="Storage" used={storage.used} cap={storage.cap} format={formatBytes} />` under Links. `UsageProvider` keeps `storage` when it overrides `saves.used`. `settings-import.tsx` keeps compiling (it reads `saves` only).
- [ ] **Step 4: Run** → PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: storage line in Settings usage`.

### Task 4: Media URL rules and content-type sniffing

**Files:**
- Create: `src/utils/image.ts`, `src/utils/video.ts`, tests beside them
- Modify: `src/utils/link-content-type-shared.ts`, `src/lib/server-detect-content-type.ts`, `src/lib/guess-content-type.ts`; tests `src/utils/link-content-type-shared.test.ts`, `src/lib/guess-content-type.test.ts`

**Interfaces:**
- Produces: `isImageUrl(url): boolean` (`.jpg .jpeg .png .gif .webp .avif .svg`), `isVideoUrl(url): boolean` (`.mp4 .webm .mov .m4v`). `type DetectedContentType = { contentType: Link["contentType"]; mimeType: string | null }`; `detectContentTypeWithFetch` and `sniffContentTypeFromHeadWithFetch` return it (`mimeType` is the parsed HEAD type, null when the rule decided or the HEAD failed); `detectContentTypeFromUrlRules` returns IMAGE/VIDEO for those URLs; `detectContentType` (server) returns `DetectedContentType`. `guessContentType` returns `"IMAGE" | "VIDEO"` too.

- [ ] **Step 1: Tests**: rules map `https://x.test/a.PNG` → IMAGE, `…/clip.mov` → VIDEO, `…/song.mp3` → AUDIO, `…/doc.pdf` → PDF; the sniff maps `image/webp` → IMAGE with `mimeType "image/webp"`, `video/mp4` → VIDEO, `text/html` → WEB with `mimeType "text/html"`, a thrown fetch → WEB with null; `guessContentType("https://x.test/a.webp") === "IMAGE"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Update the existing tests' expectations for the new return shape. **Step 4: Run** `pnpm vitest run src/utils src/lib/guess-content-type.test.ts` → PASS. **Step 5: Commit** `feat: detect image and video URLs`.

### Task 5: Media-link metadata

**Files:**
- Create: `src/utils/media-title.ts`, `src/utils/media-title.test.ts`
- Modify: `src/lib/links.ts:232-260` (`scrapeLinkMetadata`), `:354-380` (`ResolvedLinkFields`, `resolveLinkFromUrl`), `:450-530` (`refreshExistingLink`, `insertResolvedLink`), `src/lib/enrich-links.ts:155-162`
- Test: `src/lib/links.test.ts`

**Interfaces:**
- Produces: `mediaTitleFromUrl(url: string, domain: string): string` (last path segment, percent-decoded, extension removed, whitespace collapsed, cut to 500; `domain` when empty). `ResolvedLinkFields` gains `mimeType: string | null`. `mediaMetadata(url, domain, contentType): { title, description: null, favicon: defaultFavicon, thumbnail }` (thumbnail = `url` for IMAGE, null otherwise). `scrapeLinkMetadata` returns `mediaMetadata` without any fetch when `isImageUrl`, `isVideoUrl` or `isAudioUrl` matches (beside today's PDF and YouTube branches). `resolveLinkFromUrl` keeps running detection and scrape in parallel; when the detection comes back IMAGE, VIDEO or AUDIO (a sniffed type with no telling extension) it replaces the scrape's result with `mediaMetadata` for that type, so a media URL never keeps a page's fallback title. Inserts and refreshes write `mimeType`; the enrich cron writes `mimeType` beside `contentType`.

- [ ] **Step 1: Tests**: `mediaTitleFromUrl("https://cdn.test/img/My%20Shot.final.PNG", "cdn.test") === "My Shot.final"`, `mediaTitleFromUrl("https://cdn.test/", "cdn.test") === "cdn.test"`; `resolveLinkFromUrl` for `https://cdn.test/clip.mov` returns `contentType VIDEO`, `thumbnail null`, the title `"clip"` and makes no GET (the fetch mock sees only the HEAD); for `https://cdn.test/asset` whose HEAD says `image/png` returns `contentType IMAGE`, `mimeType "image/png"`, `thumbnail === url`, title `"asset"` even though the parallel page fetch answered HTML.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run src/lib/links.test.ts src/lib/enrich-links.test.ts` → PASS. **Step 5: Commit** `feat: media links resolve from the file, not the page`.

### Task 6: `linkKind`, `formatDuration` and the audio/live hooks

**Files:**
- Create: `src/lib/link-kind.ts`, `src/utils/format-duration.ts`, `src/hooks/use-audio-player.ts`, `src/hooks/use-live-cards.ts`; tests for the two pure modules

**Interfaces:**
- Produces: `type LinkKind = "image" | "video" | "audio" | "embed" | "page"`; `linkKind(link: Pick<Link, "contentType" | "embed">): LinkKind` (`embed` true → `"embed"`, then by content type, YOUTUBE/PDF/WEB → `"page"`). `cardAspectRatio(link: Pick<Link, "width" | "height">): string` → `"${w} / ${h}"` clamped to between `1 / 3` and `3 / 1`, `"16 / 10"` when either is null, zero or negative. `formatDuration(seconds: number): string` ("0:14", "1:05", "1:02:03"). `useAudioPlayer(id: string): { playing: boolean; toggle(): void }` over one module-level "current id" store (`useSyncExternalStore`), so starting one stops the other. `useLiveCards(ref, wanted: boolean): boolean` returns whether this card may play: in view (`useInView` from `motion/react`, margin "200px") and among the first `MAX_LIVE_CARDS` (= 6) claimants in a module-level set.

- [ ] **Step 1: Tests**: `linkKind` for each content type and `embed: true`; `cardAspectRatio({ width: 800, height: 600 }) === "800 / 600"`, `({ width: 4000, height: 100 }) === "3 / 1"`, `({ width: 0, height: 10 }) === "16 / 10"`, `({ width: null, height: null }) === "16 / 10"`; `formatDuration(14) === "0:14"`, `(65) === "1:05"`, `(3723) === "1:02:03"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat: link kinds, duration and media playback hooks`.

### Task 7: Media faces in cards, rows and the hover preview

**Files:**
- Create: `src/components/media-card-face.tsx`
- Modify: `src/components/shared-link-card.tsx:46-110` (`LinkCardContent`), `src/components/link-icon.tsx:33-55`, `src/components/link-preview.tsx:85-100`
- Test: `e2e/media-links.spec.ts`

**Interfaces:**
- Consumes: Task 6's `linkKind`, `cardAspectRatio`, `formatDuration`, `useAudioPlayer`, `useLiveCards`.
- Produces: `ImageFace({ link, eager })`: `<img>` of `link.thumbnail ?? link.url` in a box styled `aspect-ratio: cardAspectRatio(link)`, `object-cover`, `aria-label` the title on the card; on a media link with unknown size, `onLoad` sets the box's ratio from `naturalWidth / naturalHeight`. `VideoFace({ link })`: `<video muted loop playsInline preload="metadata" poster={thumbnail ?? undefined}>` playing while `useLiveCards` says so, paused otherwise; under `prefers-reduced-motion` it plays only on hover; the duration pill bottom-right when `duration` is set. `AudioFace({ link })`: the player strip (Reicon `Play` / `Pause` button, "0:00 / 1:05" tabular, `<input type="range">`) over `bg-muted`, wired to one `<audio preload="none">` and `useAudioPlayer(link.id)`. `LinkCardContent` renders by kind: image/video → the face alone (no title strip); audio → the face then the title/domain strip; page/embed → today's markup. `LinkIcon` for IMAGE renders the preview (`thumbnail`, else `url`) as a rounded square at the size's `px`, VIDEO renders Reicon `Video`. `LinkPreview` shows `ImageFace`/`VideoFace`/`AudioFace` in place of the thumbnail for those kinds.

- [ ] **Step 1: Write the e2e** `e2e/media-links.spec.ts`: seed an `IMAGE` link with `thumbnail` set and `width 800 height 600`, an `IMAGE` link with no thumbnail (Review Focus 3: the card shows an `img` whose `src` is the link's URL, no broken-image), a `VIDEO` link with `duration 14`, an `AUDIO` link; switch to grid (reuse `e2e/owner-grid.spec.ts`'s helper); assert the image card has an `img` and no text, `aspect-ratio` computed style `800 / 600`, the video card has a `video[muted]` and the pill "0:14", the audio card has a Play button and the title; in list view the image row's favicon slot shows an `img` with the thumbnail's `src`.
- [ ] **Step 2: Run** `pnpm test:e2e e2e/media-links.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the components above. Keep the owner's `LinkCard` untouched: its frame renders `LinkCardContent`.
- [ ] **Step 4: Run** the e2e and `e2e/owner-grid.spec.ts`, `e2e/shared-folders.spec.ts` → PASS; `pnpm lint`, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: media faces for image, video and audio pearls`.

## Part 2: uploads

### Task 8: MIME rules, validation and the preview math

**Files:**
- Create: `src/lib/uploads/mime.ts`, `src/lib/uploads/validate.ts`, `src/lib/uploads/preview.ts`, `src/lib/uploads/blob-url.ts`, tests beside each

**Interfaces:**
- Produces (`mime.ts`): `UPLOAD_MIME_TYPES: readonly string[]` (the global list); `extensionToMime(name: string): string | null` (`.m4a` → `audio/x-m4a`, `.mov` → `video/quicktime`, `.jpg`/`.jpeg` → `image/jpeg`, and so on for every allowed type); `contentTypeForMime(mime: string): "IMAGE" | "VIDEO" | "AUDIO" | null`; `sanitizeUploadName(name: string, mime: string): string` (`[A-Za-z0-9._-]`, others → `-`, cut to 120 before the extension, extension replaced by the MIME's canonical one, `"file"` when empty).
- Produces (`validate.ts`): `validateUploadFile(file: { name: string; type: string; size: number }): { ok: true; mimeType: string } | { ok: false; reason: "type" | "size"; message: string }` with the verbatim messages (`"${name} isn't a supported file"`, `"${name} is over 25 MB"`); an empty `type` falls back to `extensionToMime(name)`.
- Produces (`preview.ts`): `fitWithin(width: number, height: number, max = 1280): { width: number; height: number }` (never upscales, rounds); `makePreview(file: File, mimeType: string): Promise<{ blob: Blob | null; width: number | null; height: number | null; duration: number | null }>` (browser only: `createImageBitmap` for images, a `<video>` seeked to 0.1 s for videos, an `<audio>` for duration; GIF → `blob: null` with its size; a failure → nulls). `PREVIEW_MAX_PX = 1280`, `PREVIEW_QUALITY = 0.82`.
- Produces (`blob-url.ts`): `BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"`; `isBlobUrl(url: string): boolean`; `blobPathnameOf(url: string): string | null` (decoded path without the leading slash); `isOwnBlobPathname(pathname: string, userId: string): boolean` (`users/<userId>/` prefix, no `..`).

- [ ] **Step 1: Tests**: `validateUploadFile({ name: "song.m4a", type: "", size: 10 })` → `ok` with `audio/x-m4a` (Review Focus 2); `{ name: "photo.heic", type: "image/heic" }` → `reason "type"`, message `"photo.heic isn't a supported file"`; `{ name: "clip.mov", type: "video/quicktime", size: 25 * 1024 * 1024 + 1 }` → `"clip.mov is over 25 MB"`; `sanitizeUploadName("My Shot (1).PNG", "image/png") === "My-Shot--1-.png"`; `fitWithin(4000, 3000) → { 1280, 960 }`, `fitWithin(600, 400) → { 600, 400 }`; `blobPathnameOf("https://abc.public.blob.vercel-storage.com/users/u1/c1/a-x1.png") === "users/u1/c1/a-x1.png"`; `isOwnBlobPathname("users/u1/c1/a.png", "u1") === true`, `("users/u1/../u2/a.png", "u1") === false`, `("users/u10/c/a.png", "u1") === false`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run src/lib/uploads` → PASS. **Step 5: Commit** `feat: upload validation, naming and preview sizing`.

### Task 9: The upload token route

**Files:**
- Create: `src/lib/upload-token.ts`, `src/app/api/uploads/token/route.ts`, `src/lib/upload-token.test.ts`
- Modify: `src/lib/upstash-rate-limit.ts` (add `getUploadsTokenRateLimiter`, same window as `getLinksPostRateLimiter`), `src/lib/proxy-rate-limit.ts:116-122` (apply it to `POST /api/uploads/token`), `.env.example` (`BLOB_READ_WRITE_TOKEN=` with a comment), `package.json` (`pnpm add @vercel/blob@2.8.2`)

**Interfaces:**
- Consumes: Task 2's `assertCanSaveLink`, `assertCanStore`, `LimitError`; Task 8's `UPLOAD_MIME_TYPES`, `isOwnBlobPathname`.
- Produces: `uploadsEnabled(): boolean` (`!!process.env.BLOB_READ_WRITE_TOKEN`) in `src/lib/uploads.ts` (create the file now with this export; Task 10 fills it). `issueUploadToken(userId: string, body: HandleUploadBody, request: Request): Promise<unknown>` wraps `handleUpload({ body, request, onBeforeGenerateToken, onUploadCompleted: async () => {} })`: `onBeforeGenerateToken(pathname, clientPayload)` parses `clientPayload` as JSON `{ kind: "file" | "preview"; mimeType: string; size: number }`, throws `UploadRejectedError(code)` for a pathname not `isOwnBlobPathname(pathname, userId)` (`INVALID_PATH`), a `mimeType` not allowed (`UNSUPPORTED_TYPE`; a preview must be `image/webp`), `size > MAX_UPLOAD_FILE_BYTES` (`FILE_TOO_LARGE`), then for `kind "file"` awaits `assertCanSaveLink` and `assertCanStore(userId, size)`; returns `{ allowedContentTypes: [mimeType], maximumSizeInBytes: size, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000, tokenPayload: JSON.stringify({ userId }) }`. The route: `getBrowserSessionUserId()` else 401; `uploadsEnabled()` else `503 { code: "UPLOADS_UNAVAILABLE" }`; `UploadRejectedError` → `400 { code }`; `LimitError` → `403 LIMIT_REACHED`; otherwise the token JSON.

- [ ] **Step 1: Tests** (mock `@vercel/blob/client`'s `handleUpload` to call `onBeforeGenerateToken` directly and return its result): a good `file` payload yields `maximumSizeInBytes === size`, `addRandomSuffix === true`, `allowedContentTypes === [mimeType]`; `users/other/c/a.png` → `INVALID_PATH`; `image/heic` → `UNSUPPORTED_TYPE`; size over the cap → `FILE_TOO_LARGE`; a full account (mock `assertCanStore` to throw `StorageLimitError`) rejects with it; a `preview` payload never calls `assertCanSaveLink`. Route test: no session → 401; no `BLOB_READ_WRITE_TOKEN` → 503 with the code.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run src/lib/upload-token.test.ts src/lib/proxy-rate-limit.test.ts` → PASS. **Step 5: Commit** `feat: upload token route`.

### Task 10: Creating the upload's row

**Files:**
- Modify: `src/lib/uploads.ts`, `src/app/api/links/route.ts:95-170`
- Test: `src/lib/uploads.test.ts`, `src/app/api/links/route.test.ts` (create if missing)

**Interfaces:**
- Consumes: Task 2's `insertWithinSaveLimit(…, { bytes })`, `LimitError`; Task 8's `isBlobUrl`, `blobPathnameOf`, `isOwnBlobPathname`, `contentTypeForMime`, `UPLOAD_MIME_TYPES`; Task 1's `Link`.
- Produces: `type UploadInput = { url: string; previewUrl: string | null; mimeType: string; width: number | null; height: number | null; duration: number | null }`; `class InvalidUploadError extends Error { code = "INVALID_UPLOAD" }`; `createUploadForUser(userId: string, input: UploadInput, opts?: { folderId?: string }): Promise<Link>`: `assertFolderOwned` when given; both URLs must pass `isBlobUrl` and `isOwnBlobPathname(blobPathnameOf(url), userId)`; `head(url)` (throws → `InvalidUploadError`), its `contentType` must be in `UPLOAD_MIME_TYPES` and equal `input.mimeType`; `head(previewUrl)` when given must be `image/webp`; then `insertWithinSaveLimit(userId, tx => tx.link.create({ data: { url, title: mediaTitleFromUrl(name), favicon: "/icon.png", domain: BASE_URL host, contentType: contentTypeForMime(mime), mimeType, thumbnail: previewUrl, fileKey: head.pathname, fileSize: head.size, width, height, duration, userId, folderId } }), { bytes: head.size })` with **no** `reuse` (Review Focus 1); on any throw after the heads, `del([url, previewUrl].filter(Boolean))` then rethrow. `POST /api/links` accepts `{ upload: UploadInput, folderId? }` when `url` is absent (`upload` and `url` together → 400 "Invalid JSON body"); only with a browser session (`getBrowserSessionUserId()`, else 401; the v1 routes don't read `upload` at all); `InvalidUploadError` → `400 { code: "INVALID_UPLOAD" }`; the response is `serializeLink(link)` with 201 and `broadcastLinksChanged` as for a URL.

- [ ] **Step 1: Tests** (mock `@vercel/blob`'s `head` and `del`, and prisma as in `links-crud.test.ts`): a valid input creates the row with `fileKey` = `head.pathname`, `fileSize` = `head.size`, `title "My Shot"` from `users/u1/c1/My-Shot-x1.png`, `contentType IMAGE`, `thumbnail` = previewUrl; the same input twice creates twice (Review Focus 1); a URL on another host → `InvalidUploadError` and no `head`; another user's prefix → `InvalidUploadError`; `head` type `image/heic` → `InvalidUploadError` and `del` called with both URLs; a `StorageLimitError` from the insert → `del` called, error rethrown. Route: `{ url, upload }` → 400; `{ upload }` with no browser session → 401.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run src/lib/uploads.test.ts src/app/api/links` → PASS. **Step 5: Commit** `feat: create a pearl from an uploaded file`.

### Task 11: `uploadFiles` and the pending items

**Files:**
- Create: `src/lib/save-uploads.ts`, `src/lib/pending-upload.ts`, `src/components/skeletons/pending-upload.tsx`, `src/lib/pending-upload.test.ts`
- Modify: `src/components/home-shell.tsx` (beside `pendingSave`, lines 137, 575-640, 790-830), `src/components/link-group.tsx:16-30,70-78,140-152`

**Interfaces:**
- Consumes: Task 8's `validateUploadFile`, `makePreview`, `sanitizeUploadName`; Task 10's `UploadInput`; `@vercel/blob/client`'s `upload(pathname, file, { access: "public", handleUploadUrl: "/api/uploads/token", clientPayload, onUploadProgress, multipart: true })`.
- Produces (`pending-upload.ts`): `type PendingUpload = { id: string; name: string; kind: "image" | "video" | "audio"; previewUrl: string | null; progress: number; status: "uploading" | "failed"; width: number | null; height: number | null }`; pure helpers `addPending(list, item)`, `updatePending(list, id, patch)`, `removePending(list, id)`.
- Produces (`save-uploads.ts`): `uploadFiles(files: File[], opts: { userId: string; folderId?: string | null; onStart(item: PendingUpload): void; onProgress(id: string, progress: number): void; onDone(id: string, link: Link): Promise<void>; onError(id: string, message: string): void; onBatchDone(): void }): Promise<void>`: validates each file (toasting rejections), queues the rest and runs `MAX_CONCURRENT_UPLOADS` at once in order; per file: `onStart` with an object URL (`previewUrl`), `makePreview`, upload the file to `users/<userId>/<cuid>/<sanitized name>` (`clientPayload` `{ kind: "file", mimeType, size }`) then the preview to `…/preview.webp` (`kind "preview"`), `POST /api/links` `{ upload, folderId }`, `onDone`; a `403 LIMIT_REACHED` with `feature STORAGE_LIMIT` toasts its message once and cancels the queue; other failures `onError(id, message)` and continue; `onBatchDone` in a `finally`; the per-upload folder id is `crypto.randomUUID().replace(/-/g, "")`. `retryUpload(item)` is not needed: Retry calls `uploadFiles([file])` again with the kept `File` (the pending list keeps the `File` in a module map by id).
- Produces (`pending-upload.tsx`): `PendingUploadCard({ item, onRetry, onDismiss })` (the local preview at `cardAspectRatio`, a progress ring top-right drawn as an SVG circle with `stroke-dashoffset`, the kind's icon face for audio; "failed" shows Retry and Dismiss buttons over a scrim) and `PendingUploadRow` (the preview in the favicon slot, the name, "42%" tabular on the right, the same two buttons when failed). One `<span role="status" className="sr-only">Uploading N files</span>` rendered by `HomeShell` while any item is uploading.
- `HomeShell`: `pendingUploads: PendingUpload[]` state; `onUploadDone` is `onSaveSuccess(link.id, { quiet: true })` then `removePending`, inside `glide()`, so the real card lands in the item's slot; `LinkGroup` / `LinkGrid` take `pendingUploads` beside `pending` and render them first in "Today" in order, each with `data-flip={"upload:" + item.id}`. The synthetic "Today" shows when either list is non-empty.

- [ ] **Step 1: Tests**: the pending helpers (add/update/remove keep order); `uploadFiles` with mocked `upload`, `fetch` and `makePreview`: three files run with at most 3 in flight (count concurrent `upload` calls), a rejected file toasts and isn't uploaded, `clientPayload` for the file is `{ kind: "file", mimeType, size }`, `POST /api/links` body carries `upload.previewUrl` from the second upload's `url`, a `STORAGE_LIMIT` response stops the remaining files and calls `onBatchDone` once.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/pending-upload.test.ts src/lib/save-uploads.test.ts` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm typecheck`. **Step 5: Commit** `feat: upload queue with pending cards and rows`.

### Task 12: Entry points: + menu, drop, paste

**Files:**
- Create: `src/components/upload-input.tsx`, `src/components/drop-handler.tsx`
- Modify: `src/components/header-add-menu.tsx:56-75,160-190`, `src/components/paste-handler.tsx:110-127`, `src/components/link-group-empty.tsx`, `src/components/home-shell.tsx:733-738`, `src/app/(private)/(app)/layout.tsx` (pass `uploadsEnabled()` into `CurrentUserProvider` as `uploadsEnabled: boolean`)
- Test: `e2e/uploads.spec.ts`

**Interfaces:**
- Consumes: Task 11's `uploadFiles`; `useCurrentUser()` gains `uploadsEnabled`.
- Produces: `UPLOAD_SHORTCUT = "U"` and `openUploadPicker()` (dispatches a `purl:upload-pick` window event) in `src/lib/upload-picker.ts`; `UploadInput` (rendered by `HomeShell`): a hidden `<input type="file" multiple accept={UPLOAD_MIME_TYPES.join(",")} data-cy="upload-input">` that opens on the event and on `U` (guards as the `A` shortcut: not typing, no overlay, not in the demo) and calls `uploadFiles` on change; `DropHandler` (rendered by `HomeShell`): window `dragenter`/`dragover`/`dragleave`/`drop` with a depth counter, shows the overlay (`data-cy="drop-overlay"`, text "Drop to save" on Home or `Drop to save to ${folder.emoji} ${folder.name}` on a folder page) only when `dataTransfer.types` includes `Files`, hides while `document.querySelector('[data-settings-dialog]')` exists (add that attribute to the Settings dialog's content), uploads dropped files, hands a dropped `text/uri-list` or `text/plain` to `PasteHandler`'s `SAVE_URL_EVENT`, toasts "Folders can't be uploaded" for an entry with no type and zero size. `HeaderAddMenu` gets "Upload files" (Reicon `Upload`, `Kbd U`) above "Add links", disabled in the demo and when `!uploadsEnabled`. `PasteHandler.handlePaste` uploads `clipboardData.files` when non-empty, else today's text path. `LinkGroupEmpty` (folder empty state) adds the line "or drop files here" when `uploadsEnabled`.

- [ ] **Step 1: Write the e2e** `e2e/uploads.spec.ts` (`test.skip` when `!process.env.BLOB_READ_WRITE_TOKEN`): set the grid view; `setInputFiles` on `[data-cy="upload-input"]` with `e2e/fixtures/uploads/pixel.png` (a 2×2 PNG, committed) after pressing `U`; expect a pending card then a real card with an `img` whose `src` contains `.public.blob.vercel-storage.com`; open Settings → Usage and expect "Storage" with a non-zero value; delete the pearl through the row menu, wait past the Undo window, expect the card gone; drop via `page.dispatchEvent("drop", { dataTransfer })` built from the same file and expect a second card; paste via a `ClipboardEvent` whose `clipboardData` holds the file. After each test, list the store with `list({ prefix: "users/<id>/" })` from the worker fixture and `del` everything.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test:e2e e2e/uploads.spec.ts` → PASS; `pnpm test:e2e e2e/paste-many.spec.ts e2e/import.spec.ts` → PASS (the paste and import drop paths still work). **Step 5: Commit** `feat: upload files from the + menu, drop and paste`.

### Task 13: Deleting blobs with their rows

**Files:**
- Modify: `src/lib/uploads.ts`, `src/lib/links.ts:845-865` (`deleteLinksForUser`, `deleteLink`), `src/lib/folders.ts:541-561`, `src/lib/auth.ts:59-62`, `src/components/dialog-edit-link.tsx:99`, `src/app/api/links/[id]/route.ts:40-139` (PATCH)
- Test: `src/lib/uploads.test.ts`, `src/lib/links-crud.test.ts`, `src/lib/folders.test.ts`, `src/lib/auth-hooks.test.ts`

**Interfaces:**
- Produces: `deleteBlobsFor(rows: { url: string; fileKey: string | null; thumbnail: string | null }[]): Promise<void>` (for rows with a `fileKey`, collects `url` and the non-null `thumbnail`, one `del(urls)`, nothing when the list is empty; logs `[uploads] del failed` and resolves on error); `deleteUserBlobs(userId: string): Promise<void>` (`list({ prefix: "users/<userId>/", cursor })` pages, `del` each page, same logging). `deleteLink` / `deleteLinksForUser` select `{ url, fileKey, thumbnail }` first and call `deleteBlobsFor` after the delete. `deleteFolder` selects the same inside the transaction and calls `deleteBlobsFor` after it resolves. `auth.ts`: `deleteUser: { enabled: true, beforeDelete: async (user) => deleteUserBlobs(user.id) }`. The edit dialog hides the URL field when `link.upload`; `PATCH` with `url` on an upload answers `400 { code: "INVALID_UPLOAD" }`.

- [ ] **Step 1: Tests**: `deleteBlobsFor` with two uploads and a page link calls `del` once with the two files' URLs and their previews, skips null previews, and resolves when `del` rejects (Review Focus 4); `deleteLinksForUser` calls `deleteBlobsFor` with the selected rows; `deleteFolder({ withLinks: true })` does too, after the transaction; `deleteUserBlobs` follows `cursor` across two pages; the PATCH route rejects `url` on an upload.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run src/lib/uploads.test.ts src/lib/links-crud.test.ts src/lib/folders.test.ts src/lib/auth-hooks.test.ts` → PASS. **Step 5: Commit** `feat: delete uploaded files with their pearls`.

### Task 14: The orphan sweep cron

**Files:**
- Create: `src/lib/sweep-uploads.ts`, `src/lib/sweep-uploads.test.ts`, `src/app/api/cron/sweep-uploads/route.ts`
- Modify: `vercel.json` (add `{ "path": "/api/cron/sweep-uploads", "schedule": "0 4 * * *" }`)
- Test: `e2e/import.spec.ts`'s cron pattern for the route (one case: 503 without the secret, 401 with a wrong one, 200 JSON with the right one)

**Interfaces:**
- Produces: `SWEEP_BUDGET = 500`, `SWEEP_MIN_AGE_MS = 24 * 60 * 60 * 1000`; `sweepOrphanUploads(opts?: { now?: Date; budget?: number }): Promise<{ listed: number; deleted: number; stopped: boolean }>`: pages `list({ prefix: "users/", cursor, limit: 1000 })`; per page keeps blobs with `uploadedAt < now − age`; `prisma.link.findMany({ where: { OR: [{ url: { in } }, { thumbnail: { in } }] }, select: { url, thumbnail } })` for their URLs; deletes the unreferenced ones in one `del` (capped so `deleted` never passes the budget; `stopped: true` when it hits). The route copies `enrich-links/route.ts`'s secret check and `maxDuration = 120`.

- [ ] **Step 1: Tests** (mock `list`, `del`, prisma): a referenced blob is kept, an unreferenced old one deleted, a 1-hour-old unreferenced one kept, two pages followed by `cursor`, the budget stops at 500 with `stopped: true`, a rejected `del` is logged and the run continues (Review Focus 4).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run src/lib/sweep-uploads.test.ts`, then the cron e2e → PASS. **Step 5: Commit** `feat: daily sweep of orphaned uploads`.

### Task 15: Docs and environment

**Files:**
- Modify: `CLAUDE.md` (a "Media and uploads" bullet set under Folders, in the same style: the columns, the pipeline, the entry points, the quota, the delete paths, the sweep, the per-environment stores, the e2e skip), `.env.example` (done in Task 9; confirm), `public/llms.txt` (one sentence: files can be uploaded), `src/components/landing/landing-hero.tsx` sub-headline only if the user asks (leave as is otherwise)

- [ ] **Step 1: Write** the CLAUDE.md section and the llms.txt line.
- [ ] **Step 2: Verify** `pnpm lint && pnpm typecheck && pnpm test` → clean, and `pnpm build` → succeeds.
- [ ] **Step 3: Commit** `docs: media uploads in CLAUDE.md and llms.txt`.

---

## Self-review notes

- Spec coverage for delivery steps 1 and 2: schema (T1), limits and entitlement (T2), Usage line (T3), media-link detection and metadata (T4, T5), faces in grid, rows and preview (T6, T7), validation, previews and naming (T8), token route and rate limit (T9), row creation with `head()` and cleanup on failure (T10), queue, pending cards, FLIP landing, concurrency, status text (T11), + menu with `U`, drop overlay, paste, empty-state line, `uploadsEnabled` gating (T12), every delete path and the edit dialog (T13), the sweep (T14), docs and env (T15). Not in this plan, by design: the lightbox, shared-folder fields beyond the serializer, the feed enclosure, the OG image, embeds, the share target.
- Type consistency: `UploadInput`, `PendingUpload`, `DetectedContentType`, `LimitError`, `cardAspectRatio` and `linkKind` are named once and reused by name.
- Review Focus tests sit in Tasks 7, 8, 10, 13 and 14.
