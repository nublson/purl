import { auth } from "@/lib/auth";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import {
  createLinkFromFile,
  InvalidUploadTypeError,
  UploadStorageError,
} from "@/lib/upload-file";
import { headers } from "next/headers";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { ingestAudio } from "@/lib/ingest-audio";
import { ingestPdf } from "@/lib/ingest-pdf";
import { serializeLink } from "@/lib/serialize-link";
import {
  AUDIO_MAX_UPLOAD_BYTES,
  audioMaxSizeExceededMessage,
} from "@/utils/upload-limits";

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
  if (file.type.startsWith("audio/") && file.size > AUDIO_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: audioMaxSizeExceededMessage() },
      { status: 413 },
    );
  }
  const durationValue = formData.get("durationSeconds");
  const audioDurationSeconds =
    typeof durationValue === "string" ? Number(durationValue) : undefined;

  try {
    const link = await createLinkFromFile(
      file,
      userId,
      Number.isFinite(audioDurationSeconds) ? audioDurationSeconds : undefined,
    );
    if (link.contentType === "PDF") {
      after(() => ingestPdf({ linkId: link.id, url: link.url }));
    }
    if (link.contentType === "AUDIO") {
      after(() => ingestAudio({ linkId: link.id, url: link.url }));
    }
    await broadcastLinksChanged(userId);
    return NextResponse.json(serializeLink(link), { status: 201 });
  } catch (error) {
    if (error instanceof InvalidUploadTypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof UploadStorageError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}
