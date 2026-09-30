import { auth } from "@/lib/auth";
import { assertFolderOwned, FolderNotFoundError } from "@/lib/folders";
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

    // Resolve the session and check folder ownership up front, before any
    // write runs. This avoids the combined-body failure mode where
    // `updateLink` commits its write and then a foreign/unknown folder
    // fails the move with no rollback: catching that here means a combined
    // PATCH either does nothing or does both, never a half-applied update.
    let folderUserId: string | undefined;
    if (hasFolderId) {
      const session = await auth.api.getSession({ headers: await headers() });
      folderUserId = session?.user?.id;
      if (!folderUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const requestedFolderId = body.folderId ?? null;
      if (requestedFolderId !== null) {
        // Throws FolderNotFoundError, handled by the outer catch — before
        // `updateLink` below ever runs.
        await assertFolderOwned(folderUserId, requestedFolderId);
      }
    }

    let updated: Parameters<typeof serializeLink>[0] | null = null;
    // `moveLinkToFolder` takes an explicit userId (it doesn't resolve the
    // session itself, unlike `updateLink`) and its return type doesn't carry
    // `userId`, so track the id to broadcast with separately rather than
    // reading it off `updated`. Also doubles as the "did a write happen"
    // flag: broadcast whenever this is set, even if a later step errors.
    let broadcastUserId: string | undefined;

    const broadcastIfWritten = () => {
      if (broadcastUserId) {
        broadcastLinksChanged(
          broadcastUserId,
          parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
        );
      }
    };

    if (hasOtherFields) {
      const result = await updateLink(id, data);
      if (!result) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      updated = result;
      broadcastUserId = result.userId;
    }

    if (hasFolderId) {
      try {
        const moved = await moveLinkToFolder(
          folderUserId!,
          id,
          body.folderId ?? null,
        );
        if (!moved) {
          broadcastIfWritten();
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        updated = moved;
        broadcastUserId = folderUserId;
      } catch (e) {
        broadcastIfWritten();
        throw e;
      }
    }

    broadcastIfWritten();
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
