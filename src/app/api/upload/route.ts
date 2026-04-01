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
import { ingestPdf } from "@/lib/ingest-pdf";

function serializeLink(link: {
  id: string;
  url: string;
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
  domain: string;
  contentType?: "WEB" | "YOUTUBE" | "PDF" | "AUDIO";
  createdAt: Date;
}) {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    favicon: link.favicon,
    thumbnail: link.thumbnail,
    domain: link.domain,
    contentType: link.contentType ?? "WEB",
    createdAt: link.createdAt.toISOString(),
  };
}

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
    return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
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
