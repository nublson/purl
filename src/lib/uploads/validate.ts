import { MAX_UPLOAD_FILE_BYTES } from "@/lib/limits";
import { UPLOAD_MIME_TYPES, extensionToMime } from "./mime";

export type UploadValidation =
  | { ok: true; mimeType: string }
  | { ok: false; reason: "type" | "size"; message: string };

const IMAGE_LIKE = new Set(["heic", "heif", "bmp", "tif", "tiff", "psd", "ico", "jxl", "raw", "cr2", "nef", "dng"]);
const VIDEO_LIKE = new Set(["avi", "mkv", "wmv", "flv", "3gp", "mpg", "mpeg", "ogv", "ts", "m2ts"]);
const AUDIO_LIKE = new Set(["aiff", "aif", "wma", "aac", "opus", "mid", "midi", "amr", "caf"]);

/** The error names what would work: the kind's formats when the name says which kind. */
export function unsupportedFormatMessage(name: string): string {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const formats = IMAGE_LIKE.has(extension)
    ? "JPEG, PNG, GIF, WebP, AVIF or SVG for images"
    : VIDEO_LIKE.has(extension)
      ? "MP4, WebM or MOV for video"
      : AUDIO_LIKE.has(extension)
        ? "MP3, M4A, WAV, OGG or FLAC for audio"
        : null;
  return formats
    ? `${name} isn't a supported format. Use ${formats}.`
    : `${name} isn't a supported format. Upload an image, video or audio file.`;
}

/**
 * Checks a file before it is uploaded: the reported type when allowed, else
 * the type its extension maps to, else rejected; then the size cap.
 */
export function validateUploadFile(file: {
  name: string;
  type: string;
  size: number;
}): UploadValidation {
  const reported = file.type.trim().toLowerCase();
  const mimeType = UPLOAD_MIME_TYPES.includes(reported)
    ? reported
    : extensionToMime(file.name);

  if (!mimeType || !(file.size > 0)) {
    return {
      ok: false,
      reason: "type",
      message: unsupportedFormatMessage(file.name),
    };
  }
  if (!(file.size <= MAX_UPLOAD_FILE_BYTES)) {
    return {
      ok: false,
      reason: "size",
      message: `${file.name} is over 25 MB`,
    };
  }
  return { ok: true, mimeType };
}
