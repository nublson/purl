import {
  detectContentTypeWithFetch,
  type DetectedContentType,
} from "@/utils/link-content-type-shared";

/**
 * Client-safe URL content-type detection (plain `fetch`; subject to browser CORS).
 * For server-side resolution use `@/lib/server-detect-content-type`.
 */
export async function detectContentType(
  url: string,
): Promise<DetectedContentType> {
  return detectContentTypeWithFetch(url, fetch);
}
