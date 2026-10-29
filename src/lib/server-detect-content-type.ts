import "server-only";

import { safeFetch } from "@/lib/safe-outbound-fetch";
import {
  detectContentTypeWithFetch,
  type DetectedContentType,
} from "@/utils/link-content-type-shared";

/** Server-only content-type detection (HEAD sniff uses SSRF-safe fetch). */
export async function detectContentType(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<DetectedContentType> {
  return detectContentTypeWithFetch(url, safeFetch, options.signal);
}
