import { experimental_transcribe as transcribe } from "ai";
import { getTranscriptionModel } from "@/lib/ai";
import { safeFetch, type SafeFetchInit } from "@/lib/safe-outbound-fetch";
import { parseHttpUrl } from "@/utils/url";

const YOUTUBE_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const YOUTUBE_AUDIO_TIMEOUT_MS = 120_000;

export class YoutubeTranscriptUnavailableError extends Error {
  readonly name = "YoutubeTranscriptUnavailableError";
  constructor(message: string) {
    super(message);
  }
}

export function isYouTubeTranscriptUnavailableError(
  error: unknown,
): boolean {
  return error instanceof YoutubeTranscriptUnavailableError;
}

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

function segmentsToTimestampedText(
  segments: ReadonlyArray<{ text: string; startSecond: number }>,
  fallbackText: string,
): string {
  if (segments.length > 0) {
    return segments
      .map((s) => `[${formatTimestamp(s.startSecond)}] ${s.text.trim()}`.trim())
      .filter(Boolean)
      .join("\n");
  }
  const trimmed = fallbackText.trim();
  if (!trimmed) return "";
  return `[${formatTimestamp(0)}] ${trimmed}`;
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

function youtubeInnerTubeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;
  return safeFetch(href, init as SafeFetchInit);
}

type YoutubeInfo = Awaited<
  ReturnType<import("youtubei.js").default["getInfo"]>
>;

async function tryTranscriptViaInnerTube(
  info: YoutubeInfo,
): Promise<string | null> {
  try {
    const transcriptInfo = await info.getTranscript();
    const body = transcriptInfo.transcript.content?.body;
    if (!body) return null;

    const { YTNodes } = await import("youtubei.js");
    const { TranscriptSegment } = YTNodes;

    const lines: string[] = [];
    for (const segment of body.initial_segments) {
      if (!segment.is(TranscriptSegment)) continue;
      const seg = segment as InstanceType<typeof TranscriptSegment>;
      const text = cleanTranscriptLine(seg.snippet.text ?? "");
      if (!text) continue;
      const startMs = Number.parseInt(seg.start_ms, 10);
      const seconds = Number.isFinite(startMs) ? startMs / 1000 : 0;
      lines.push(`[${formatTimestamp(seconds)}] ${text}`);
    }

    return lines.length > 0 ? lines.join("\n") : null;
  } catch {
    return null;
  }
}

async function transcribeViaWhisper(
  innertube: import("youtubei.js").default,
  info: YoutubeInfo,
): Promise<string> {
  let format: ReturnType<YoutubeInfo["chooseFormat"]>;
  try {
    format = info.chooseFormat({ type: "audio", quality: "bestefficiency" });
  } catch {
    throw new YoutubeTranscriptUnavailableError(
      "No audio format available for this video",
    );
  }

  const audioUrl = await format.decipher(innertube.session.player);
  if (!audioUrl) {
    throw new YoutubeTranscriptUnavailableError(
      "Could not decipher audio stream URL",
    );
  }

  let response: Response;
  try {
    response = await safeFetch(audioUrl, {
      signal: AbortSignal.timeout(YOUTUBE_AUDIO_TIMEOUT_MS),
      maxResponseBytes: YOUTUBE_AUDIO_MAX_BYTES,
    });
  } catch {
    throw new YoutubeTranscriptUnavailableError("Audio download failed");
  }

  if (!response.ok) {
    throw new YoutubeTranscriptUnavailableError(
      `Audio download failed (${response.status})`,
    );
  }

  const blob = await response.blob();
  if (blob.size > YOUTUBE_AUDIO_MAX_BYTES) {
    throw new YoutubeTranscriptUnavailableError(
      "YouTube video audio exceeds the 25 MB transcription limit",
    );
  }

  const audioData = new Uint8Array(await blob.arrayBuffer());

  const result = await transcribe({
    model: getTranscriptionModel(),
    audio: audioData,
    providerOptions: {
      openai: { timestampGranularities: ["segment"] },
    },
  });

  const text = segmentsToTimestampedText(result.segments ?? [], result.text);
  if (!text) {
    throw new YoutubeTranscriptUnavailableError(
      "YouTube transcript unavailable or empty",
    );
  }
  return text;
}

export async function fetchYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractVideoId(url);

  const { default: Innertube } = await import("youtubei.js");

  const innertube = await Innertube.create({
    fetch: youtubeInnerTubeFetch,
  });

  let info: YoutubeInfo;
  try {
    info = await innertube.getInfo(videoId);
  } catch {
    throw new YoutubeTranscriptUnavailableError(
      "Could not retrieve YouTube video info",
    );
  }

  const fastResult = await tryTranscriptViaInnerTube(info);
  if (fastResult !== null) return fastResult;

  return transcribeViaWhisper(innertube, info);
}
