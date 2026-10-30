#!/usr/bin/env node
/**
 * One-off: gives uploaded images saved without a preview their preview.
 *
 * Safari's canvas can't encode WebP, and previews were WebP only, so every
 * image uploaded from an iPhone was stored with `thumbnail` null: its list
 * row showed Purl's icon, and the media viewer decoded the full photo to
 * open. New uploads fall back to JPEG; this fills in the ones already saved,
 * the way `makePreview` would have: the long side at most 1,280px, WebP at
 * quality 82, EXIF orientation applied, stored beside the file as
 * `<dir>/preview-<suffix>.webp`. A row without a size gets one too.
 *
 * Images only (not GIFs: a GIF's original is its preview, so it stays
 * animated). Videos without a poster need a frame from the file, which
 * sharp can't draw: they're counted and left alone.
 *
 * Dry run by default (lists what it would do); `--apply` writes. Needs
 * `DATABASE_URL` and the matching store's `BLOB_READ_WRITE_TOKEN`, e.g.:
 *
 *   node --env-file=.env.local scripts/backfill-upload-previews.mjs
 *   node --env-file=.env.local scripts/backfill-upload-previews.mjs --apply
 *
 * Options: `--user <id>` (one account), `--limit <n>` (at most n rows).
 * Safe to run again: a row is only written while its thumbnail is still
 * null, and a preview stored for a row that changed meanwhile is deleted.
 */

import { del, put } from "@vercel/blob";
import pg from "pg";
import sharp from "sharp";

const PREVIEW_MAX_PX = 1280;
const PREVIEW_QUALITY = 82;
/** `MAX_UPLOAD_FILE_BYTES`: no upload is larger. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** `MAX_UPLOAD_PREVIEW_BYTES`. */
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const FETCH_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const args = { apply: false, user: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--user") args.user = argv[++i] ?? null;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.limit !== null && !(Number.isInteger(args.limit) && args.limit > 0)) {
    throw new Error("--limit takes a positive integer");
  }
  return args;
}

/** The file's own Blob URL, in the store's `users/<userId>/` prefix. */
function isOwnBlobFile(row) {
  let url;
  try {
    url = new URL(row.url);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX) &&
    decodeURIComponent(url.pathname.slice(1)) === row.fileKey &&
    row.fileKey.startsWith(`users/${row.userId}/`)
  );
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GET ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`file is ${bytes.length} bytes`);
  return bytes;
}

/** The preview and the image's own (oriented) size. */
async function makePreview(bytes) {
  const { data, info } = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({
      width: PREVIEW_MAX_PX,
      height: PREVIEW_MAX_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_QUALITY })
    .toBuffer({ resolveWithObject: true });
  if (data.length > MAX_PREVIEW_BYTES) throw new Error(`preview is ${data.length} bytes`);

  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  // Orientations 5–8 turn the image a quarter: its width is its height.
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  return { preview: data, width: width ?? info.width, height: height ?? info.height };
}

function directoryOf(pathname) {
  return pathname.slice(0, pathname.lastIndexOf("/"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (args.apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const where = [`"fileKey" IS NOT NULL`, `"thumbnail" IS NULL`];
    const params = [];
    if (args.user) {
      params.push(args.user);
      where.push(`"userId" = $${params.length}`);
    }

    const { rows: videos } = await client.query(
      `SELECT count(*)::int AS n FROM "links"
       WHERE ${where.join(" AND ")} AND "contentType" = 'VIDEO'`,
      params,
    );

    let sql = `SELECT "id", "userId", "url", "fileKey", "title", "mimeType", "width", "height"
      FROM "links"
      WHERE ${where.join(" AND ")}
        AND "contentType" = 'IMAGE'
        AND coalesce("mimeType", '') <> 'image/gif'
      ORDER BY "createdAt" DESC`;
    if (args.limit) sql += ` LIMIT ${args.limit}`;
    const { rows } = await client.query(sql, params);

    console.log(
      `${rows.length} image upload(s) without a preview` +
        (videos[0].n ? `; ${videos[0].n} video(s) without a poster, skipped` : "") +
        (args.apply ? "" : " (dry run: pass --apply to write)"),
    );

    let done = 0;
    let failed = 0;
    for (const row of rows) {
      const label = `${row.id} "${row.title}"`;
      if (!isOwnBlobFile(row)) {
        console.warn(`skip ${label}: its URL isn't its own Blob file`);
        failed++;
        continue;
      }
      if (!args.apply) {
        console.log(`would preview ${label}`);
        continue;
      }
      let stored = null;
      try {
        const { preview, width, height } = await makePreview(await download(row.url));
        stored = await put(`${directoryOf(row.fileKey)}/preview.webp`, preview, {
          access: "public",
          contentType: "image/webp",
          addRandomSuffix: true,
        });
        const result = await client.query(
          `UPDATE "links"
           SET "thumbnail" = $1,
               "width" = coalesce("width", $2),
               "height" = coalesce("height", $3)
           WHERE "id" = $4 AND "url" = $5 AND "thumbnail" IS NULL`,
          [stored.url, width, height, row.id, row.url],
        );
        if (result.rowCount !== 1) {
          // Deleted, or given a preview meanwhile: the new blob is nobody's.
          await del(stored.url);
          console.warn(`skip ${label}: the row changed meanwhile`);
          continue;
        }
        done++;
        console.log(`previewed ${label}`);
      } catch (error) {
        failed++;
        console.error(`failed ${label}: ${error instanceof Error ? error.message : error}`);
        if (stored) await del(stored.url).catch(() => {});
      }
    }

    if (args.apply) console.log(`done: ${done} previewed, ${failed} failed or skipped`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
