import { safeFetch, type SafeFetchInit } from "@/lib/safe-outbound-fetch";
import { parseHttpUrl } from "@/utils/url";
import type { TranscriptResponse } from "youtube-transcript";

const YOUTUBE_TRANSCRIPT_FETCH_MAX_BYTES = 12 * 1024 * 1024;
const WATCH_PAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Prefix used by `youtube-transcript` for all library-thrown errors (see npm package source). */
const YOUTUBE_TRANSCRIPT_LIB_PREFIX = "[YoutubeTranscript] 🚨 ";

/** Matches `youtube-transcript` defaults so InnerTube / caption requests look consistent. */
const YOUTUBE_WEBPAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
} as const;
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

const RE_XML_TRANSCRIPT =
  /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

/** Extra ISO-ish codes when the default track's caption XML fails but another language works. */
const YOUTUBE_LANG_FALLBACKS: readonly string[] = [
  "en",
  "en-US",
  "en-GB",
  "pt",
  "pt-BR",
  "pt-PT",
  "es",
  "es-419",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "hi",
  "ru",
  "nl",
  "pl",
  "ar",
];

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

function assertYouTubeTranscriptFetchUrl(href: string): void {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    throw new TypeError("Invalid transcript fetch URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new TypeError("Invalid transcript fetch URL protocol");
  }
  const host = u.hostname.toLowerCase();
  if (host === "youtube.com" || host.endsWith(".youtube.com")) return;
  throw new TypeError("Transcript fetch limited to youtube.com hosts");
}

/**
 * {@link safeFetch} adapter for `youtube-transcript` so egress matches oEmbed
 * (pinned DNS, optional `SAFE_OUTBOUND_HTTP_PROXY`).
 */
export function youtubeTranscriptFetch(
  input: RequestInfo | URL,
  init?: SafeFetchInit,
): Promise<Response> {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  assertYouTubeTranscriptFetchUrl(href);
  return safeFetch(href, {
    ...init,
    maxRedirects: 8,
    maxResponseBytes: YOUTUBE_TRANSCRIPT_FETCH_MAX_BYTES,
  });
}

/** True when ingest can continue with title/description only (no timed captions). */
export function isRecoverableYoutubeTranscriptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "YouTube transcript unavailable or empty") return true;
  return error.message.startsWith(YOUTUBE_TRANSCRIPT_LIB_PREFIX);
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

function parseInlineYoutubeJson(html: string, globalName: string): unknown | null {
  const startToken = `var ${globalName} = `;
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) return null;
  const jsonStart = startIndex + startToken.length;
  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type CaptionTrack = { languageCode: string; baseUrl: string };

function captionTracksFromPlayerJson(data: unknown): CaptionTrack[] {
  const tracks =
    (data as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown } } })
      ?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  const out: CaptionTrack[] = [];
  for (const t of tracks) {
    const row = t as { languageCode?: string; baseUrl?: string };
    const languageCode = typeof row.languageCode === "string" ? row.languageCode : "";
    const baseUrl = typeof row.baseUrl === "string" ? row.baseUrl : "";
    if (!languageCode || !baseUrl) continue;
    try {
      const u = new URL(baseUrl);
      if (!u.hostname.toLowerCase().endsWith(".youtube.com")) continue;
    } catch {
      continue;
    }
    out.push({ languageCode, baseUrl });
  }
  return out;
}

async function listCaptionTracksViaInnerTube(videoId: string): Promise<CaptionTrack[]> {
  try {
    const resp = await youtubeTranscriptFetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId,
      }),
      maxResponseBytes: YOUTUBE_TRANSCRIPT_FETCH_MAX_BYTES,
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as unknown;
    return captionTracksFromPlayerJson(data);
  } catch {
    return [];
  }
}

async function listCaptionTracksViaWatchPage(videoId: string): Promise<CaptionTrack[]> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const pageResp = await youtubeTranscriptFetch(watchUrl, {
      headers: {
        "User-Agent": YOUTUBE_WEBPAGE_USER_AGENT,
      },
      signal: AbortSignal.timeout(15_000),
      maxRedirects: 8,
      maxResponseBytes: WATCH_PAGE_MAX_BYTES,
    });
    const html = await pageResp.text();
    if (html.includes('class="g-recaptcha"')) return [];
    if (!html.includes('"playabilityStatus":')) return [];
    const playerResponse = parseInlineYoutubeJson(html, "ytInitialPlayerResponse");
    return captionTracksFromPlayerJson(playerResponse);
  } catch {
    return [];
  }
}

async function listYoutubeCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const inner = await listCaptionTracksViaInnerTube(videoId);
  if (inner.length > 0) return inner;
  return listCaptionTracksViaWatchPage(videoId);
}

/** Mirrors `youtube-transcript` XML parsing; offsets/durations normalized to seconds. */
function parseYoutubeCaptionXml(xml: string, lang: string): TranscriptResponse[] {
  const results: TranscriptResponse[] = [];
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = Number.parseInt(match[1], 10);
    const durMs = Number.parseInt(match[2], 10);
    const inner = match[3];
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) text = inner.replace(/<[^>]+>/g, "");
    text = decodeHtmlEntities(text).trim();
    if (text) {
      results.push({
        text,
        duration: durMs / 1000,
        offset: startMs / 1000,
        lang,
      });
    }
  }
  if (results.length > 0) return results;

  RE_XML_TRANSCRIPT.lastIndex = 0;
  const classic = [...xml.matchAll(RE_XML_TRANSCRIPT)];
  return classic.map((result) => ({
    text: decodeHtmlEntities(result[3]),
    duration: Number.parseFloat(result[2]),
    offset: Number.parseFloat(result[1]),
    lang,
  }));
}

async function fetchTranscriptTryingEachCaptionTrack(
  videoId: string,
): Promise<TranscriptResponse[] | null> {
  const tracks = await listYoutubeCaptionTracks(videoId);
  for (const track of tracks) {
    try {
      const res = await youtubeTranscriptFetch(track.baseUrl, {
        headers: {
          "User-Agent": YOUTUBE_WEBPAGE_USER_AGENT,
          "Accept-Language": track.languageCode,
        },
        maxRedirects: 8,
        maxResponseBytes: YOUTUBE_TRANSCRIPT_FETCH_MAX_BYTES,
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseYoutubeCaptionXml(xml, track.languageCode);
      if (items.length > 0) return items;
    } catch {
      continue;
    }
  }
  return null;
}

/** youtube-transcript srv3 uses ms for offset/duration; classic XML uses seconds. */
function cueOffsetSeconds(item: TranscriptResponse): number {
  const o = item.offset;
  if (typeof o !== "number" || !Number.isFinite(o)) return 0;
  const d = item.duration;
  if (typeof d === "number" && Number.isFinite(d) && d >= 50) {
    return o / 1000;
  }
  return o;
}

function transcriptItemsToFormattedLines(items: TranscriptResponse[]): string[] {
  return items
    .map((item) => {
      const cleaned = cleanTranscriptLine(item.text ?? "");
      if (!cleaned) return "";
      const seconds = cueOffsetSeconds(item);
      return `[${formatTimestamp(seconds)}] ${cleaned}`.trim();
    })
    .filter(Boolean);
}

/** True when trying alternate caption tracks / languages may succeed. */
function isYoutubeCaptionPipelineRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  if (!msg.startsWith(YOUTUBE_TRANSCRIPT_LIB_PREFIX)) return false;
  const rest = msg.slice(YOUTUBE_TRANSCRIPT_LIB_PREFIX.length);
  if (rest.startsWith("YouTube is receiving too many requests")) return false;
  if (rest.startsWith("The video is no longer available")) return false;
  if (rest.startsWith("Impossible to retrieve Youtube video ID")) return false;
  return true;
}

export async function fetchYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractVideoId(url);

  const { YoutubeTranscript } = await import("youtube-transcript");

  let lastError: unknown;

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, {
      fetch: youtubeTranscriptFetch,
    });
    const lines = transcriptItemsToFormattedLines(items);
    if (lines.length === 0) {
      throw new Error("YouTube transcript unavailable or empty");
    }
    return lines.join("\n");
  } catch (e) {
    lastError = e;
  }

  if (lastError && isYoutubeCaptionPipelineRetryable(lastError)) {
    const fromTracks = await fetchTranscriptTryingEachCaptionTrack(videoId);
    if (fromTracks && fromTracks.length > 0) {
      const lines = transcriptItemsToFormattedLines(fromTracks);
      if (lines.length > 0) return lines.join("\n");
    }

    for (const lang of YOUTUBE_LANG_FALLBACKS) {
      try {
        const items = await YoutubeTranscript.fetchTranscript(videoId, {
          fetch: youtubeTranscriptFetch,
          lang,
        });
        const lines = transcriptItemsToFormattedLines(items);
        if (lines.length > 0) return lines.join("\n");
      } catch {
        continue;
      }
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError));
}
