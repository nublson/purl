import { parseHttpUrl } from "./url";

export const STREAMING_MUSIC_DOMAINS = [
  "spotify.com",
  "music.youtube.com",
  "music.apple.com",
  "soundcloud.com",
  "deezer.com",
  "tidal.com",
  "pandora.com",
  "audiomack.com",
] as const;

function isHostnameOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isStreamingMusicUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;

  const hostname = stripWww(parsed.hostname.toLowerCase());
  return STREAMING_MUSIC_DOMAINS.some((domain) =>
    isHostnameOrSubdomain(hostname, domain),
  );
}
