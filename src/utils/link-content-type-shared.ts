import { isAudioUrl } from "@/utils/audio";
import type { Link } from "@/utils/links";
import { isPdfUrl } from "@/utils/pdf";
import { isYouTubeUrl } from "@/utils/youtube";

const USER_AGENT =
  "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)";

const SNIFF_TIMEOUT_MS = 5000;

export type HeadFetchFn = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

function parseMimeType(contentType: string | null): string {
  if (!contentType) return "";
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export async function sniffContentTypeFromHeadWithFetch(
  url: string,
  fetchImpl: HeadFetchFn,
): Promise<Link["contentType"]> {
  try {
    const response = await fetchImpl(url, {
      method: "HEAD",
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(SNIFF_TIMEOUT_MS),
    });
    const mimeType = parseMimeType(response.headers.get("content-type"));
    await response.body?.cancel();
    if (mimeType === "application/pdf") return "PDF";
    if (mimeType.startsWith("audio/")) return "AUDIO";
    return "WEB";
  } catch {
    return "WEB";
  }
}

export function detectContentTypeFromUrlRules(
  url: string,
): Link["contentType"] | null {
  if (isYouTubeUrl(url)) return "YOUTUBE";
  if (isPdfUrl(url)) return "PDF";
  if (isAudioUrl(url)) return "AUDIO";
  return null;
}

export async function detectContentTypeWithFetch(
  url: string,
  fetchImpl: HeadFetchFn,
): Promise<Link["contentType"]> {
  const fromRules = detectContentTypeFromUrlRules(url);
  if (fromRules !== null) return fromRules;
  return sniffContentTypeFromHeadWithFetch(url, fetchImpl);
}
