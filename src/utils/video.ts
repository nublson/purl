import { parseHttpUrl } from "./url";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

export function isVideoUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;

  const pathname = parsed.pathname.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}
