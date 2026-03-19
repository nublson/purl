import {
  readLink,
  updateLink,
  deleteLink,
  type UpdateLinkData,
} from "@/lib/links";
import { auth } from "@/lib/auth";
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
    createdAt: link.createdAt.toISOString(),
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: _request.headers,
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const link = await readLink(id, session.user.id);
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeLink(link));
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateLinkData;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasUrl = typeof body?.url === "string";
  const hasTitle = typeof body?.title === "string";
  const hasDescription = body?.description !== undefined;
  if (!hasUrl && !hasTitle && !hasDescription) {
    return NextResponse.json(
      { error: "At least one of url, title, or description is required" },
      { status: 400 },
    );
  }

  const url = hasUrl ? (body.url as string).trim() : undefined;
  if (url !== undefined && (!url || !isValidUrl(url))) {
    return NextResponse.json(
      { error: "Invalid or missing URL" },
      { status: 400 },
    );
  }

  const data: UpdateLinkData = {};
  if (url !== undefined) data.url = url;
  if (hasTitle) data.title = body.title as string;
  if (hasDescription) data.description = body.description;

  const { id } = await context.params;
  const updated = await updateLink(id, session.user.id, data);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeLink(updated));
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: _request.headers,
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await deleteLink(id, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
