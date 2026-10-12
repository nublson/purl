import { isYouTubeUrl } from "@/utils/youtube";

export type GuessedContentType = "WEB" | "YOUTUBE" | "PDF" | "AUDIO";

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac"]);

/** Classifies a URL from its address alone, without any network request. */
export function guessContentType(url: string): GuessedContentType {
  if (isYouTubeUrl(url)) return "YOUTUBE";
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return "WEB";
  }
  const extension = pathname.match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "pdf") return "PDF";
  if (extension && AUDIO_EXTENSIONS.has(extension)) return "AUDIO";
  return "WEB";
}
