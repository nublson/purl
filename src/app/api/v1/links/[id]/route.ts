import { auth } from "@/lib/auth";
import { assertFolderOwned, FolderNotFoundError } from "@/lib/folders";
import {
  deleteLink,
  moveLinkToFolder,
  readLink,
  UnauthorizedError,
  updateLink,
  updateLinkForUser,
  type UpdateLinkData,
} from "@/lib/links";
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

/**
 * Updates a link: `{ url?, title?, description?, folderId? }`. `folderId`
 * files the link into that folder; `null` takes it out of its folder.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let body: UpdateLinkData & { folderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const hasUrl = typeof body?.url === "string";
  const hasTitle = typeof body?.title === "string";
  const hasDescription = body?.description !== undefined;
  const hasFolderId =
    body !== null && typeof body === "object" && "folderId" in body;

  if (hasFolderId && body.folderId !== null && typeof body.folderId !== "string") {
    return addCors(NextResponse.json({ error: "Invalid folder" }, { status: 400 }));
  }

  if (!hasUrl && !hasTitle && !hasDescription && !hasFolderId) {
    return addCors(
      NextResponse.json(
        { error: "At least one of url, title, description, or folderId is required" },
        { status: 400 },
      ),
    );
  }

  const url = hasUrl ? (body.url as string).trim() : undefined;
  if (url !== undefined && (!url || !isValidUrl(url))) {
    return addCors(NextResponse.json({ error: "Invalid URL" }, { status: 400 }));
  }

  const data: UpdateLinkData = {};
  if (url !== undefined) data.url = url;
  if (hasTitle) data.title = body.title as string;
  if (hasDescription) data.description = body.description;
  const hasOtherFields = hasUrl || hasTitle || hasDescription;

  try {
    const { id } = await context.params;

    if (!hasFolderId) {
      // Fields only: `updateLink` resolves the session itself.
      const updated = await updateLink(id, data);
      if (!updated) {
        return addCors(NextResponse.json({ error: "Not found" }, { status: 404 }));
      }
      broadcastLinksChanged(updated.userId);
      return addCors(NextResponse.json(serializeLink(updated)));
    }

    // Same flow as the app's PATCH /api/links/[id]: check folder ownership
    // before writing, then one write for a move (plus any field edits).
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const folderId = (body.folderId as string | null) ?? null;
    if (folderId !== null) {
      // Throws FolderNotFoundError, handled below.
      await assertFolderOwned(userId, folderId);
    }

    const updated = hasOtherFields
      ? await updateLinkForUser(userId, id, { ...data, folderId })
      : await moveLinkToFolder(userId, id, folderId);
    if (!updated) {
      return addCors(NextResponse.json({ error: "Not found" }, { status: 404 }));
    }
    broadcastLinksChanged(userId);
    return addCors(NextResponse.json(serializeLink(updated)));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    if (e instanceof FolderNotFoundError) {
      return addCors(NextResponse.json({ error: "Folder not found" }, { status: 404 }));
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
      broadcastLinksChanged(session.user.id);
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
