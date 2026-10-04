import "server-only";

import {
  limitReadableStreamByBytes,
  safeFetch,
} from "@/lib/safe-outbound-fetch";
import sharp from "sharp";

/**
 * Largest remote image the preview will download (blog covers are often a
 * few MB); anything over `RESIZE_ABOVE_BYTES` is scaled down before it's
 * inlined.
 */
export const OG_REMOTE_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
/** Images bigger than this are scaled down (to 480px wide) before inlining. */
const RESIZE_ABOVE_BYTES = 300 * 1024;
/** How long one remote image may take before it's skipped. */
export const OG_REMOTE_IMAGE_TIMEOUT_MS = 3000;

/** Formats the preview renderer (Satori / resvg) can draw as they are. */
const DRAWABLE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
/**
 * Formats it can't draw, which many sites use for their preview images:
 * converted to PNG with sharp first.
 */
const CONVERTIBLE_TYPES = new Set(["image/webp", "image/avif"]);
/**
 * Converted and large images are scaled to at most this width: twice the
 * preview's widest use (a 230px card), so they stay sharp without inlining
 * a large image.
 */
const SCALED_MAX_WIDTH = 480;
/**
 * Refuses to decode images larger than this many pixels (a small file can
 * still claim huge dimensions).
 */
const CONVERT_MAX_PIXELS = 40_000_000;

/**
 * The response body, read until `maxBytes` and no further: `null` once it
 * goes over (the rest isn't downloaded).
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!response.body) return null;
  const reader = limitReadableStreamByBytes(response.body, maxBytes).getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

/** sharp's format names, as content types the preview can use. */
const FORMAT_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heif: "image/avif",
};

/**
 * What the bytes really are, from their header (no full decode): a content
 * type the preview can use, or `null` when it isn't a usable image or is
 * over the pixel cap.
 */
async function inspect(bytes: Buffer): Promise<string | null> {
  try {
    const { format, width, height } = await sharp(bytes, {
      limitInputPixels: CONVERT_MAX_PIXELS,
    }).metadata();
    const type = format ? FORMAT_TYPES[format] : undefined;
    if (!type || !width || !height || width * height > CONVERT_MAX_PIXELS) {
      return null;
    }
    return type;
  } catch {
    return null;
  }
}

/**
 * An image scaled to at most 480px wide (first frame of an animation), as
 * JPEG when it was one (photos stay small) and PNG otherwise (keeps
 * transparency, and turns WebP / AVIF into something drawable). `null` when
 * sharp can't read it.
 */
async function scaleDown(
  bytes: Buffer,
  type: string,
): Promise<{ type: string; data: Buffer } | null> {
  try {
    const image = sharp(bytes, {
      limitInputPixels: CONVERT_MAX_PIXELS,
      animated: false,
    }).resize({ width: SCALED_MAX_WIDTH, withoutEnlargement: true });
    return type === "image/jpeg"
      ? { type, data: await image.jpeg({ quality: 82 }).toBuffer() }
      : { type: "image/png", data: await image.png().toBuffer() };
  } catch {
    return null;
  }
}

/**
 * A remote image (a link's thumbnail, the owner's avatar) as a `data:` URL
 * for the preview image, fetched through `safeFetch` (SSRF-safe, size-capped,
 * time-boxed) so the renderer never contacts other sites itself. WebP and
 * AVIF are converted to PNG and large images scaled down. `null` when it
 * can't be fetched or drawn; callers leave it out.
 */
export async function fetchImageAsDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await safeFetch(url, {
      maxResponseBytes: OG_REMOTE_IMAGE_MAX_BYTES,
      signal: AbortSignal.timeout(OG_REMOTE_IMAGE_TIMEOUT_MS),
      headers: {
        accept: "image/png,image/jpeg,image/gif,image/webp,image/avif;q=0.9,*/*;q=0.1",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!DRAWABLE_TYPES.has(type) && !CONVERTIBLE_TYPES.has(type)) {
      await response.body?.cancel();
      return null;
    }
    // Content-Length can be missing or wrong: the cap holds while reading.
    const bytes = await readCapped(response, OG_REMOTE_IMAGE_MAX_BYTES);
    if (!bytes || bytes.byteLength === 0) return null;
    // Every image is checked before use, small ones too: it must really be
    // an image (its bytes, not its label, decide the type) and within the
    // pixel cap, so a malformed or decompression-bomb file can't break or
    // stall the preview.
    const actual = await inspect(bytes);
    if (!actual) return null;
    if (CONVERTIBLE_TYPES.has(actual) || bytes.byteLength > RESIZE_ABOVE_BYTES) {
      const scaled = await scaleDown(bytes, actual);
      return scaled
        ? `data:${scaled.type};base64,${scaled.data.toString("base64")}`
        : null;
    }
    return `data:${actual};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
