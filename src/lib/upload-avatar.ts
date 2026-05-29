import { getAdminSupabase } from "@/lib/supabase-admin";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  avatarMaxSizeExceededMessage,
} from "@/utils/upload-limits";
import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_BUCKET = "avatars";

export class InvalidAvatarTypeError extends Error {
  readonly name = "InvalidAvatarTypeError";
}

export class AvatarMaxSizeError extends Error {
  readonly name = "AvatarMaxSizeError";
}

export class AvatarStorageError extends Error {
  readonly name = "AvatarStorageError";
}

function getRequiredAdminSupabase(): SupabaseClient {
  const supabase = getAdminSupabase();
  if (!supabase) {
    throw new AvatarStorageError(
      "Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).",
    );
  }
  return supabase;
}

function getExtensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  const [, subtype] = mimeType.split("/");
  return subtype ? subtype.toLowerCase() : "bin";
}

async function ensurePublicAvatarBucket(
  supabase: SupabaseClient,
): Promise<void> {
  const bucket = await supabase.storage.getBucket(AVATAR_BUCKET);
  if (bucket.error) {
    if (!bucket.error.message.toLowerCase().includes("not found")) {
      throw new AvatarStorageError(bucket.error.message);
    }

    const createdBucket = await supabase.storage.createBucket(AVATAR_BUCKET, {
      public: true,
    });
    if (createdBucket.error && !createdBucket.error.message.includes("exists")) {
      throw new AvatarStorageError(createdBucket.error.message);
    }
    return;
  }

  if (!bucket.data.public) {
    const updatedBucket = await supabase.storage.updateBucket(AVATAR_BUCKET, {
      public: true,
    });
    if (updatedBucket.error) {
      throw new AvatarStorageError(updatedBucket.error.message);
    }
  }
}

function getPublicAvatarUrl(storagePath: string): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!url) {
    throw new AvatarStorageError("Supabase URL is not configured.");
  }
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${AVATAR_BUCKET}/${storagePath}`;
}

export async function uploadUserAvatar(
  file: File,
  userId: string,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new InvalidAvatarTypeError("Only image files are supported.");
  }
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
    throw new AvatarMaxSizeError(avatarMaxSizeExceededMessage());
  }

  const supabase = getRequiredAdminSupabase();
  await ensurePublicAvatarBucket(supabase);

  const extension = getExtensionFromMime(file.type);
  const storagePath = `${userId}/avatar.${extension}`;
  const bytes = await file.arrayBuffer();

  const uploadResult = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadResult.error) {
    throw new AvatarStorageError(uploadResult.error.message);
  }

  return getPublicAvatarUrl(storagePath);
}
