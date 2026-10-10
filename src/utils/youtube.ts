import { parseHttpUrl } from "./url";

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isYouTubeUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;

  const hostname = stripWww(parsed.hostname.toLowerCase());
  const pathname = parsed.pathname;

  if (hostname === "youtu.be") {
    const id = pathname.split("/").filter(Boolean)[0] ?? "";
    return Boolean(id);
  }

  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (pathname === "/watch") {
      const id = parsed.searchParams.get("v") ?? "";
      return Boolean(id);
    }

    const segments = pathname.split("/").filter(Boolean);
    if ((segments[0] === "shorts" || segments[0] === "live") && segments[1]) {
      return true;
    }
  }

  return false;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The privacy-enhanced embed URL for a YouTube link, or null. */
export function getYouTubeEmbedUrl(url: string): string | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;

  const hostname = stripWww(parsed.hostname.toLowerCase());
  const segments = parsed.pathname.split("/").filter(Boolean);
  let id: string | undefined;

  if (hostname === "youtu.be") {
    id = segments[0];
  } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (parsed.pathname === "/watch") {
      id = parsed.searchParams.get("v") ?? undefined;
    } else if (["shorts", "live", "embed"].includes(segments[0] ?? "")) {
      id = segments[1];
    }
  }

  return id && YOUTUBE_ID.test(id)
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : null;
}
