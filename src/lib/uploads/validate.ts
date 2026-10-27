import { MAX_UPLOAD_FILE_BYTES } from "@/lib/limits";
import { UPLOAD_MIME_TYPES, extensionToMime } from "./mime";

export type UploadValidation =
  | { ok: true; mimeType: string }
  | { ok: false; reason: "type" | "size"; message: string };

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
      message: `${file.name} isn't a supported file`,
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
