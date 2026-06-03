import { auth } from "@/lib/auth";
import { deleteLink, readLink, updateLink, UnauthorizedError } from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { serializeLink } from "@/lib/serialize-link";
import { isValidUrl } from "@/utils/url";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../../cors";

export async function OPTIONS(_request: NextRequest): Promise<Response> {
  return corsPreflightResponse();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const link = await readLink(id);
    if (!link) {
      return addCors(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }
    return addCors(NextResponse.json(serializeLink(link)));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    throw e;
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let body: { url?: string; title?: string; description?: string | null };
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const hasUrl = typeof body?.url === "string";
  const hasTitle = typeof body?.title === "string";
  const hasDescription = body?.description !== undefined;
  if (!hasUrl && !hasTitle && !hasDescription) {
    return addCors(
      NextResponse.json(
        { error: "At least one of url, title, or description is required" },
        { status: 400 }
      )
    );
  }

  const url = hasUrl ? (body.url as string).trim() : undefined;
  if (url !== undefined && (!url || !isValidUrl(url))) {
    return addCors(NextResponse.json({ error: "Invalid URL" }, { status: 400 }));
  }

  try {
    const { id } = await context.params;
    const updated = await updateLink(id, {
      ...(url !== undefined ? { url } : {}),
      ...(hasTitle ? { title: body.title } : {}),
      ...(hasDescription ? { description: body.description } : {}),
    });
    if (!updated) {
      return addCors(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }
    await broadcastLinksChanged(updated.userId);
    return addCors(NextResponse.json(serializeLink(updated)));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const deleted = await deleteLink(id);
    if (!deleted) {
      return addCors(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }
    // deleteLink returns boolean — get userId from session for broadcast
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id) {
      await broadcastLinksChanged(session.user.id);
    }
    const response = new NextResponse(null, { status: 204 });
    return addCors(response);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    throw e;
  }
}
