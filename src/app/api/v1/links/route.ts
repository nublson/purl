import { SaveLimitError } from "@/lib/entitlements";
import { FolderNotFoundError } from "@/lib/folders";
import {
  createLink,
  LinkNotesError,
  listLinks,
  UnauthorizedError,
} from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { serializeLink } from "@/lib/serialize-link";
import { isValidUrl } from "@/utils/url";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../cors";

const VALID_CONTENT_TYPES = new Set(["WEB", "YOUTUBE", "PDF", "AUDIO"]);

export async function OPTIONS(_request: NextRequest): Promise<Response> {
  return corsPreflightResponse();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = isNaN(rawLimit) ? 50 : Math.max(1, Math.min(rawLimit, 100));
  const cursor = searchParams.get("cursor") ?? null;
  const rawContentType = searchParams.get("contentType");
  const contentType =
    rawContentType && VALID_CONTENT_TYPES.has(rawContentType) ? rawContentType : null;
  // An empty `folderId` means "no folder filter", same as omitting it.
  const folderId = searchParams.get("folderId") || undefined;

  try {
    const result = await listLinks({ limit, cursor, contentType, folderId });
    return addCors(
      NextResponse.json({
        data: result.links.map(serializeLink),
        nextCursor: result.nextCursor,
      })
    );
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { url?: string; folderId?: string; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !isValidUrl(url)) {
    return addCors(
      NextResponse.json({ error: "Invalid or missing URL" }, { status: 400 })
    );
  }

  // An empty `folderId` means "no folder", same as omitting it.
  const folderId =
    typeof body?.folderId === "string" && body.folderId !== ""
      ? body.folderId
      : undefined;

  const hasNotes = body?.notes !== undefined;
  if (hasNotes && body.notes !== null && typeof body.notes !== "string") {
    return addCors(NextResponse.json({ error: "Invalid notes" }, { status: 400 }));
  }
  const notes = hasNotes ? (body.notes as string | null) : undefined;

  try {
    const options = {
      ...(folderId ? { folderId } : {}),
      ...(notes !== undefined ? { notes } : {}),
    };
    const link =
      Object.keys(options).length > 0
        ? await createLink(url, options)
        : await createLink(url);
    broadcastLinksChanged(link.userId);
    return addCors(
      NextResponse.json(
        { ...serializeLink(link), moved: link.moved },
        { status: 201 }
      )
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    if (e instanceof SaveLimitError) {
      return addCors(
        NextResponse.json(
          { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
          { status: 403 }
        )
      );
    }
    if (e instanceof FolderNotFoundError) {
      return addCors(NextResponse.json({ error: "Folder not found" }, { status: 404 }));
    }
    if (e instanceof LinkNotesError) {
      return addCors(
        NextResponse.json(
          { error: e.message, code: "INVALID_NOTES" },
          { status: 400 }
        )
      );
    }
    throw e;
  }
}
