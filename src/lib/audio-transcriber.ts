import { experimental_transcribe as transcribe } from "ai";
import { getTranscriptionModel } from "@/lib/ai";
import {
  AUDIO_MAX_UPLOAD_BYTES,
  audioMaxSizeExceededMessage,
} from "@/utils/upload-limits";

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function segmentsToTimestampedText(
  segments: ReadonlyArray<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>,
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

/**
 * Fetches audio from a URL, enforces size limit, transcribes with Whisper (verbose segments),
 * and returns text with inline [HH:MM:SS] timestamps per segment.
 */
export async function transcribeAudio(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch audio (${response.status})`);
  }

  const declaredLen = parseContentLength(response.headers.get("content-length"));
  if (declaredLen !== null && declaredLen > AUDIO_MAX_UPLOAD_BYTES) {
    throw new Error(audioMaxSizeExceededMessage());
  }

  const blob = await response.blob();
  if (blob.size > AUDIO_MAX_UPLOAD_BYTES) {
    throw new Error(audioMaxSizeExceededMessage());
  }

  const audioData = new Uint8Array(await blob.arrayBuffer());

  const result = await transcribe({
    model: getTranscriptionModel(),
    audio: audioData,
    providerOptions: {
      openai: {
        timestampGranularities: ["segment"],
      },
    },
  });

  return segmentsToTimestampedText(result.segments, result.text);
}
