import { parseHttpUrl } from "./url";

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".aac",
  ".m4a",
  ".opus",
  ".wma",
];

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isSpotifyAudioPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0];
  return (
    root === "track" ||
    root === "album" ||
    root === "playlist" ||
    root === "artist" ||
    root === "episode"
  );
}

export function isAudioUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;

  const pathname = parsed.pathname.toLowerCase();
  if (AUDIO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return true;
  }

  const hostname = stripWww(parsed.hostname.toLowerCase());
  if (hostname === "open.spotify.com") {
    return isSpotifyAudioPath(parsed.pathname.toLowerCase());
  }
  if (hostname === "music.apple.com") return true;
  if (hostname === "music.youtube.com") return true;

  return false;
}
