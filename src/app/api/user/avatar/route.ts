import { auth } from "@/lib/auth";
import {
  AvatarMaxSizeError,
  AvatarStorageError,
  InvalidAvatarTypeError,
  uploadUserAvatar,
} from "@/lib/upload-avatar";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  avatarMaxSizeExceededMessage,
} from "@/utils/upload-limits";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file upload." },
      { status: 400 },
    );
  }
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: avatarMaxSizeExceededMessage() },
      { status: 413 },
    );
  }

  try {
    const image = await uploadUserAvatar(file, userId);
    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof InvalidAvatarTypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AvatarMaxSizeError) {
      return NextResponse.json(
        { error: avatarMaxSizeExceededMessage() },
        { status: 413 },
      );
    }
    if (error instanceof AvatarStorageError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}
