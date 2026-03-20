import { createLink, UnauthorizedError } from "@/lib/links";
import { isValidUrl } from "@/utils/url";
import { NextRequest, NextResponse } from "next/server";

function serializeLink(link: {
  id: string;
  url: string;
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
  domain: string;
  contentType?: "WEB" | "YOUTUBE" | "PDF";
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
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { error: "Invalid or missing URL" },
      { status: 400 },
    );
  }

  try {
    const link = await createLink(url);
    return NextResponse.json(serializeLink(link), { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
