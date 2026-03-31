import prisma from "@/lib/prisma";
import { getAdminSupabase } from "@/lib/supabase-admin";
import type { ContentType } from "@/generated/prisma/enums";
import { getDefaultFaviconUrl } from "@/utils/default-favicon";

const UPLOAD_BUCKET = "user-uploads";

type UploadableContentType = Extract<ContentType, "PDF" | "AUDIO">;

function getContentTypeFromMime(mimeType: string): UploadableContentType | null {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return null;
}

function getExtensionFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  const [, subtype] = mimeType.split("/");
  return subtype ? subtype.toLowerCase() : "bin";
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFileSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export class InvalidUploadTypeError extends Error {
  readonly name = "InvalidUploadTypeError";
}

export class UploadStorageError extends Error {
  readonly name = "UploadStorageError";
}

async function uploadToStorage(
  path: string,
  bytes: ArrayBuffer,
  mimeType: string,
) {
  const supabase = getAdminSupabase();
  if (!supabase) {
    throw new UploadStorageError(
      "Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).",
    );
  }

  const attemptUpload = async () =>
    supabase.storage.from(UPLOAD_BUCKET).upload(path, bytes, {
      contentType: mimeType || undefined,
      upsert: false,
    });

  let uploadResult = await attemptUpload();
  if (uploadResult.error?.message?.toLowerCase().includes("bucket not found")) {
    const createdBucket = await supabase.storage.createBucket(UPLOAD_BUCKET, {
      public: true,
    });
    if (createdBucket.error && !createdBucket.error.message.includes("exists")) {
      throw new UploadStorageError(createdBucket.error.message);
    }
    uploadResult = await attemptUpload();
  }

  if (uploadResult.error) {
    throw new UploadStorageError(uploadResult.error.message);
  }

  const publicUrlResult = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
  const publicUrl = publicUrlResult.data.publicUrl;
  if (!publicUrl) {
    throw new UploadStorageError("Failed to resolve uploaded file URL.");
  }

  return publicUrl;
}

export async function createLinkFromFile(
  file: File,
  userId: string,
  audioDurationSeconds?: number,
): Promise<Awaited<ReturnType<typeof prisma.link.create>>> {
  const contentType = getContentTypeFromMime(file.type);
  if (!contentType) {
    throw new InvalidUploadTypeError("Only PDF and audio files are supported.");
  }

  const bytes = await file.arrayBuffer();
  const extension = getExtensionFromMime(file.type);
  const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;
  const fileName = sanitizeFileName(file.name);
  const fallbackTitle = contentType === "PDF" ? "Uploaded PDF" : "Uploaded Audio";
  const title = (fileName || fallbackTitle).slice(0, 500);
  const fileSize = formatFileSize(file.size);
  const description =
    contentType === "PDF"
      ? (fileSize ? `PDF Document - ${fileSize}` : "PDF Document")
      : (() => {
          const duration = formatDuration(audioDurationSeconds ?? NaN);
          return duration ? `Audio File - ${duration}` : "Audio File";
        })();

  const publicUrl = await uploadToStorage(filePath, bytes, file.type);

  return prisma.link.create({
    data: {
      url: publicUrl,
      title,
      description,
      favicon: getDefaultFaviconUrl("upload"),
      thumbnail: null,
      domain: "upload",
      contentType,
      userId,
    },
  });
}
