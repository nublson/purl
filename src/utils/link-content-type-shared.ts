import { timeoutSignal } from "@/utils/abort-signal";
import { isAudioUrl } from "@/utils/audio";
import { isImageUrl } from "@/utils/image";
import type { Link } from "@/utils/links";
import { isPdfUrl } from "@/utils/pdf";
import { isVideoUrl } from "@/utils/video";
import { isYouTubeUrl } from "@/utils/youtube";

const USER_AGENT =
  "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)";

export const SNIFF_TIMEOUT_MS = 5000;

/** A content type plus the MIME type the HEAD sniff saw (null when no request decided it). */
export type DetectedContentType = {
  contentType: Link["contentType"];
  mimeType: string | null;
};

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
  signal?: AbortSignal,
): Promise<DetectedContentType> {
  try {
    const response = await fetchImpl(url, {
      method: "HEAD",
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: timeoutSignal(SNIFF_TIMEOUT_MS, signal),
    });
    const mimeType = parseMimeType(response.headers.get("content-type"));
    await response.body?.cancel();
    const mime = mimeType || null;
    if (mimeType === "application/pdf")
      return { contentType: "PDF", mimeType: mime };
    if (mimeType.startsWith("audio/"))
      return { contentType: "AUDIO", mimeType: mime };
    if (mimeType.startsWith("image/"))
      return { contentType: "IMAGE", mimeType: mime };
    if (mimeType.startsWith("video/"))
      return { contentType: "VIDEO", mimeType: mime };
    return { contentType: "WEB", mimeType: mime };
  } catch {
    return { contentType: "WEB", mimeType: null };
  }
}

export function detectContentTypeFromUrlRules(
  url: string,
): Link["contentType"] | null {
  if (isYouTubeUrl(url)) return "YOUTUBE";
  if (isPdfUrl(url)) return "PDF";
  if (isAudioUrl(url)) return "AUDIO";
  if (isImageUrl(url)) return "IMAGE";
  if (isVideoUrl(url)) return "VIDEO";
  return null;
}

export async function detectContentTypeWithFetch(
  url: string,
  fetchImpl: HeadFetchFn,
  signal?: AbortSignal,
): Promise<DetectedContentType> {
  const fromRules = detectContentTypeFromUrlRules(url);
  if (fromRules !== null) return { contentType: fromRules, mimeType: null };
  return sniffContentTypeFromHeadWithFetch(url, fetchImpl, signal);
}
