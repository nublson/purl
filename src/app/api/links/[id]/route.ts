import { auth } from "@/lib/auth";
import { assertFolderOwned, FolderNotFoundError } from "@/lib/folders";
import { canEmbed } from "@/lib/embeds";
import { checkFrameable } from "@/lib/frameable";
import { tooManyRequests } from "@/lib/proxy-rate-limit";
import { getLinkPreviewRateLimiter } from "@/lib/upstash-rate-limit";
import {
  readLink,
  readLinkForUser,
  updateLink,
  updateLinkForUser,
  deleteLink,
  moveLinkToFolder,
  type UpdateLinkData,
  UnauthorizedError,
} from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { serializeLink } from "@/lib/serialize-link";
import { InvalidUploadError } from "@/lib/uploads";
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

/** `url` sent for an upload (`updateLinkForUser` throws `InvalidUploadError`). */
const UPLOAD_URL_ERROR = {
  error: "An upload's file can't be changed",
  code: "INVALID_UPLOAD",
};

const embedError = (error: string, code: string) =>
  NextResponse.json({ error, code }, { status: 400 });

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

  const hasEmbed =
    body !== null && typeof body === "object" && "embed" in body;
  if (hasEmbed && typeof body.embed !== "boolean") {
    return NextResponse.json({ error: "Invalid embed" }, { status: 400 });
  }

  if (!hasUrl && !hasTitle && !hasDescription && !hasFolderId && !hasEmbed) {
    return NextResponse.json(
      {
        error:
          "At least one of url, title, description, folderId, or embed is required",
      },
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

  if (hasEmbed) data.embed = body.embed;

  const hasOtherFields = hasUrl || hasTitle || hasDescription || hasEmbed;

  try {
    const { id } = await context.params;

    const broadcast = (userId: string) =>
      broadcastLinksChanged(
        userId,
        parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
      );

    if (!hasFolderId && !hasEmbed) {
      // Fields only: `updateLink` resolves the session itself.
      const result = await updateLink(id, data);
      if (!result) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      broadcast(result.userId);
      return NextResponse.json(serializeLink(result));
    }

    // Resolve the session and check folder ownership up front, before any
    // write runs, so a foreign/unknown folder is a fast 404 with nothing
    // written.
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const folderId = hasFolderId ? (body.folderId ?? null) : undefined;
    if (folderId) {
      // Throws FolderNotFoundError, handled by the outer catch.
      await assertFolderOwned(userId, folderId);
    }

    if (body.embed === true) {
      // Turning a pearl live frames a third-party page, so it is limited per
      // user and checked here, against what the database holds (never the
      // request) and a PATCH that changes the url can't also turn it on.
      const limiter = getLinkPreviewRateLimiter();
      if (limiter) {
        const { success, reset } = await limiter.limit(userId);
        if (!success) return tooManyRequests(reset);
      }
      const stored = await readLinkForUser(userId, id);
      if (!stored) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (url !== undefined && url !== stored.url) {
        // The type and framing checks below are for the stored page; a new
        // url in the same request would sidestep them.
        return embedError(
          "Change the link and turn on Show live separately",
          "INVALID_EMBED",
        );
      }
      if (!canEmbed(stored)) {
        return embedError("This page can't be shown live", "INVALID_EMBED");
      }
      // YouTube's pages refuse framing; its embed URL is what gets framed.
      if (stored.contentType !== "YOUTUBE") {
        const verdict = await checkFrameable(stored.url);
        if (verdict === "blocked") {
          return embedError(
            "This site doesn't allow being shown live",
            "NOT_FRAMEABLE",
          );
        }
        if (verdict === "unreachable") {
          return embedError("Couldn't reach this site", "UNREACHABLE");
        }
      }
    }

    // folderId only: a plain move. Combined: one `updateLinkForUser` write
    // carrying both the field edits and the folderId, so a folder deleted
    // after the check above fails the whole write (FolderNotFoundError →
    // 404) rather than leaving the edit committed behind an error.
    const updated = hasOtherFields
      ? await updateLinkForUser(
          userId,
          id,
          folderId === undefined ? data : { ...data, folderId },
        )
      : await moveLinkToFolder(userId, id, folderId ?? null);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    broadcast(userId);
    return NextResponse.json(serializeLink(updated));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    if (e instanceof InvalidUploadError) {
      return NextResponse.json(UPLOAD_URL_ERROR, { status: 400 });
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
