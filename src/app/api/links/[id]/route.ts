import { auth } from "@/lib/auth";
import { FolderNotFoundError } from "@/lib/folders";
import {
  readLink,
  updateLink,
  deleteLink,
  moveLinkToFolder,
  type UpdateLinkData,
  UnauthorizedError,
} from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { serializeLink } from "@/lib/serialize-link";
import { isValidUrl } from "@/utils/url";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const link = await readLink(id);
    if (!link) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(serializeLink(link));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}

type PatchBody = UpdateLinkData & { folderId?: string | null };

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasUrl = typeof body?.url === "string";
  const hasTitle = typeof body?.title === "string";
  const hasDescription = body?.description !== undefined;
  const hasFolderId =
    body !== null && typeof body === "object" && "folderId" in body;

  if (hasFolderId && body.folderId !== null && typeof body.folderId !== "string") {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  if (!hasUrl && !hasTitle && !hasDescription && !hasFolderId) {
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

  const hasOtherFields = hasUrl || hasTitle || hasDescription;

  try {
    const { id } = await context.params;

    let updated: Parameters<typeof serializeLink>[0] | null = null;
    // `moveLinkToFolder` takes an explicit userId (it doesn't resolve the
    // session itself, unlike `updateLink`) and its return type doesn't carry
    // `userId`, so track the id to broadcast with separately rather than
    // reading it off `updated`.
    let broadcastUserId: string | undefined;

    if (hasOtherFields) {
      const result = await updateLink(id, data);
      if (!result) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      updated = result;
      broadcastUserId = result.userId;
    }

    if (hasFolderId) {
      const session = await auth.api.getSession({ headers: await headers() });
      const userId = session?.user?.id;
      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const moved = await moveLinkToFolder(userId, id, body.folderId ?? null);
      if (!moved) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      updated = moved;
      broadcastUserId = userId;
    }

    // `updated`/`broadcastUserId` are always set here: hasOtherFields or
    // hasFolderId is guaranteed by the "nothing to update" guard above, and
    // each branch either returns early or assigns both.
    broadcastLinksChanged(
      broadcastUserId!,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return NextResponse.json(serializeLink(updated!));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const deleted = await deleteLink(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (session?.user?.id) {
      broadcastLinksChanged(
        session.user.id,
        parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
