import "server-only";

import { safeFetch } from "@/lib/safe-outbound-fetch";

/** Largest remote image the preview will embed. */
export const OG_REMOTE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** How long one remote image may take before it's skipped. */
export const OG_REMOTE_IMAGE_TIMEOUT_MS = 3000;

/**
 * Formats the preview renderer (Satori / resvg) can draw. WebP and AVIF
 * aren't among them, so those thumbnails are skipped.
 */
const DRAWABLE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);

/**
 * A remote image (a link's thumbnail, the owner's avatar) as a `data:` URL
 * for the preview image, fetched through `safeFetch` (SSRF-safe, size-capped,
 * time-boxed) so the renderer never contacts other sites itself. `null` when
 * it can't be fetched or drawn; callers leave it out.
 */
export async function fetchImageAsDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await safeFetch(url, {
      maxResponseBytes: OG_REMOTE_IMAGE_MAX_BYTES,
      signal: AbortSignal.timeout(OG_REMOTE_IMAGE_TIMEOUT_MS),
      headers: { accept: "image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!DRAWABLE_TYPES.has(type)) {
      await response.body?.cancel();
      return null;
    }
    const bytes = await response.arrayBuffer();
    // Content-Length can be missing or wrong: check what actually arrived.
    if (bytes.byteLength === 0 || bytes.byteLength > OG_REMOTE_IMAGE_MAX_BYTES) {
      return null;
    }
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
