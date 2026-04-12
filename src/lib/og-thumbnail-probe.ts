import {
  limitReadableStreamByBytes,
  safeFetch,
} from "@/lib/safe-outbound-fetch";

const OGS_PROBE_UA =
  "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)";

/** Single probe budget; keeps metadata scrape responsive. */
const OG_THUMBNAIL_PROBE_TIMEOUT_MS = 5000;

const OG_THUMBNAIL_PROBE_MAX_SNIFF_BYTES = 16 * 1024;

function primaryMimeType(contentType: string | null): string | null {
  if (!contentType) return null;
  const main = contentType.split(";")[0]?.trim().toLowerCase();
  return main || null;
}

function isImageContentType(contentType: string | null): boolean {
  const main = primaryMimeType(contentType);
  return main !== null && main.startsWith("image/");
}

function isClearlyNonImageContentType(contentType: string | null): boolean {
  const main = primaryMimeType(contentType);
  if (!main) return false;
  return (
    main === "text/html" ||
    main === "application/xhtml+xml" ||
    main.startsWith("text/") ||
    main === "application/json" ||
    main === "application/javascript" ||
    main === "application/xml"
  );
}

function looksLikeImageSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return true;
  }

  const headLen = Math.min(48, bytes.length);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, headLen));
  if (head.includes("ftyp")) {
    if (
      head.includes("avif") ||
      head.includes("mif1") ||
      head.includes("msf1") ||
      head.includes("heic")
    ) {
      return true;
    }
  }

  return false;
}

async function readSniffBuffer(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const limited = limitReadableStreamByBytes(
    stream,
    OG_THUMBNAIL_PROBE_MAX_SNIFF_BYTES,
  );
  const reader = limited.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) {
      parts.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.byteLength;
  }
  return merged;
}

type HeadProbeResult = "valid" | "invalid" | "inconclusive";

async function probeHead(url: string): Promise<HeadProbeResult> {
  try {
    const res = await safeFetch(url, {
      method: "HEAD",
      headers: { "User-Agent": OGS_PROBE_UA },
      signal: AbortSignal.timeout(OG_THUMBNAIL_PROBE_TIMEOUT_MS),
      maxRedirects: 4,
    });
    try {
      if (res.status === 405 || res.status === 501) {
        return "inconclusive";
      }
      if (!res.ok) {
        return "invalid";
      }
      const ct = res.headers.get("content-type");
      if (isImageContentType(ct)) {
        return "valid";
      }
      if (isClearlyNonImageContentType(ct)) {
        return "invalid";
      }
      return "inconclusive";
    } finally {
      await res.body?.cancel();
    }
  } catch {
    return "inconclusive";
  }
}

async function probeGet(url: string): Promise<boolean> {
  let res: Response;
  try {
    res = await safeFetch(url, {
      method: "GET",
      headers: {
        "User-Agent": OGS_PROBE_UA,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(OG_THUMBNAIL_PROBE_TIMEOUT_MS),
      maxRedirects: 4,
    });
  } catch {
    return false;
  }

  try {
    if (!res.ok) {
      await res.body?.cancel();
      return false;
    }
    if (isImageContentType(res.headers.get("content-type"))) {
      await res.body?.cancel();
      return true;
    }
    if (!res.body) {
      return false;
    }
    const merged = await readSniffBuffer(res.body);
    return looksLikeImageSignature(merged);
  } catch {
    await res.body?.cancel().catch(() => {});
    return false;
  }
}

/**
 * True when the URL responds like a real image (Content-Type and/or magic bytes).
 * Swallows errors — callers treat false as “do not store this thumbnail”.
 */
export async function validateOgThumbnailUrl(url: string): Promise<boolean> {
  const head = await probeHead(url);
  if (head === "valid") return true;
  if (head === "invalid") return false;
  return probeGet(url);
}
