import { isAudioUrl } from "@/utils/audio";
import type { Link } from "@/utils/links";
import { isPdfUrl } from "@/utils/pdf";
import { isYouTubeUrl } from "@/utils/youtube";

export function detectContentType(url: string): Link["contentType"] {
  if (isYouTubeUrl(url)) return "YOUTUBE";
  if (isPdfUrl(url)) return "PDF";
  if (isAudioUrl(url)) return "AUDIO";
  return "WEB";
}
