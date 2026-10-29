/**
 * Upload MIME rules. Pure and importable from server and browser code.
 */

/** Each allowed type with its extensions; the first is the canonical one. */
const MIME_EXTENSIONS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/gif", ["gif"]],
  ["image/webp", ["webp"]],
  ["image/avif", ["avif"]],
  ["image/svg+xml", ["svg"]],
  ["video/mp4", ["mp4", "m4v"]],
  ["video/webm", ["webm"]],
  ["video/quicktime", ["mov"]],
  ["audio/mpeg", ["mp3"]],
  ["audio/mp4", ["m4a"]],
  ["audio/x-m4a", ["m4a"]],
  ["audio/wav", ["wav"]],
  ["audio/ogg", ["ogg", "oga"]],
  ["audio/flac", ["flac"]],
];

export const UPLOAD_MIME_TYPES: readonly string[] = MIME_EXTENSIONS.map(
  ([mime]) => mime,
);

const EXTENSION_TO_MIME = new Map<string, string>();
for (const [mime, extensions] of MIME_EXTENSIONS) {
  for (const extension of extensions) {
    // `.m4a` belongs to audio/x-m4a (what browsers report most often);
    // audio/mp4 is accepted when reported, but never inferred from a name.
    if (!EXTENSION_TO_MIME.has(extension) || mime === "audio/x-m4a") {
      EXTENSION_TO_MIME.set(extension, mime);
    }
  }
}

const CANONICAL_EXTENSION = new Map<string, string>(
  MIME_EXTENSIONS.map(([mime, extensions]) => [mime, extensions[0]]),
);

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export function extensionToMime(name: string): string | null {
  const extension = extensionOf(name);
  if (!extension) return null;
  return EXTENSION_TO_MIME.get(extension) ?? null;
}

export function contentTypeForMime(
  mime: string,
): "IMAGE" | "VIDEO" | "AUDIO" | null {
  if (!UPLOAD_MIME_TYPES.includes(mime)) return null;
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  return null;
}

const MAX_BASE_LENGTH = 120;

/**
 * A storage-safe file name: `[A-Za-z0-9._-]` only, the base cut to 120
 * characters, the extension replaced by the MIME's canonical one.
 */
export function sanitizeUploadName(name: string, mime: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const safeBase = base.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, MAX_BASE_LENGTH);
  const extension = CANONICAL_EXTENSION.get(mime);
  const stem = /^\.*$/.test(safeBase) ? "file" : safeBase;
  return extension ? `${stem}.${extension}` : stem;
}
