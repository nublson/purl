import "server-only";

import { safeFetch } from "@/lib/safe-outbound-fetch";
import { detectContentTypeWithFetch } from "@/utils/link-content-type-shared";
import type { Link } from "@/utils/links";

/** Server-only content-type detection (HEAD sniff uses SSRF-safe fetch). */
export async function detectContentType(
  url: string,
): Promise<Link["contentType"]> {
  return detectContentTypeWithFetch(url, safeFetch);
}
