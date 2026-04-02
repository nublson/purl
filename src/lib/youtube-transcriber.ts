import { parseHttpUrl } from "@/utils/url";
import type { TranscriptResponse } from "youtube-transcript";

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function decodeHtmlEntities(input: string): string {
  // youtube-transcript text frequently includes minimal HTML entities
  // (e.g. &amp; or &#39;). We only decode the common cases we expect.
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number.parseInt(String(code), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const n = Number.parseInt(String(hex), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _m;
    });
}

function cleanTranscriptLine(text: string): string {
  const decoded = decodeHtmlEntities(text);
  const withoutBracketed = decoded.replace(/\[[^\]]+\]/gi, " ");
  return withoutBracketed.replace(/\s+/g, " ").trim();
}

export function extractVideoId(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed) throw new Error("Invalid YouTube URL");

  const hostname = stripWww(parsed.hostname.toLowerCase());
  const pathname = parsed.pathname;

  if (hostname === "youtu.be") {
    const id = pathname.split("/").filter(Boolean)[0] ?? "";
    if (!id) throw new Error("Missing YouTube video id");
    return id;
  }

  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (pathname === "/watch") {
      const id = parsed.searchParams.get("v") ?? "";
      if (!id) throw new Error("Missing YouTube video id");
      return id;
    }

    const segments = pathname.split("/").filter(Boolean);
    const prefix = segments[0];
    const id = segments[1] ?? "";
    if ((prefix === "shorts" || prefix === "live") && id) return id;
  }

  throw new Error("Invalid YouTube URL");
}

export async function fetchYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractVideoId(url);

  const { YoutubeTranscript } =
    (await import("youtube-transcript/dist/youtube-transcript.esm.js")) as unknown as {
      YoutubeTranscript: {
        fetchTranscript: (videoId: string) => Promise<TranscriptResponse[]>;
      };
    };

  const items = await YoutubeTranscript.fetchTranscript(videoId);
  const lines = items
    .map((item) => {
      const cleaned = cleanTranscriptLine(item.text ?? "");
      if (!cleaned) return "";
      const seconds = typeof item.offset === "number" ? item.offset / 1000 : 0;
      return `[${formatTimestamp(seconds)}] ${cleaned}`.trim();
    })
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("YouTube transcript unavailable or empty");
  }

  return lines.join("\n");
}
