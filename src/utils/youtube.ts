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
