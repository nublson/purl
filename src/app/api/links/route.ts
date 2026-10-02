import { SaveLimitError } from "@/lib/entitlements";
import { FolderNotFoundError } from "@/lib/folders";
import {
  createLink,
  getLinksPageForCurrentUser,
  UnauthorizedError,
} from "@/lib/links";
import { HOME_LINKS_PAGE_SIZE, MAX_SAVED_LINKS } from "@/lib/limits";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { serializeLink } from "@/lib/serialize-link";
import { resolveRequestTimeZone } from "@/lib/time-zone";
import { groupLinksByDate } from "@/utils/links";
import { TIME_ZONE_COOKIE } from "@/utils/time-zone";
import { isValidUrl } from "@/utils/url";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

/**
 * Credentialed CORS only for origins listed in `ALLOWED_ORIGINS`. Extensions
 * are not allowed wholesale: Purl's extension calls this from its service
 * worker with `host_permissions` for the app, which Chrome exempts from the
 * same-origin policy, so it needs no CORS headers — and a blanket
 * `chrome-extension://` allowance would let any installed extension post
 * links as the signed-in user. To allow a specific extension anyway (e.g. an
 * unpacked dev build without host permissions), add its
 * `chrome-extension://<id>` origin to `ALLOWED_ORIGINS`.
 */
function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

export async function OPTIONS(request: NextRequest) {
  return withCors(request, new NextResponse(null, { status: 204 }));
}

/**
 * Session-authenticated list for the /home infinite scroll and reloads.
 * `limit` (1..MAX_SAVED_LINKS, default one page) and `cursor` (ISO createdAt of
 * the last loaded link). Returns date-grouped links plus the user's total count.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit") ?? HOME_LINKS_PAGE_SIZE);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_SAVED_LINKS)
    : HOME_LINKS_PAGE_SIZE;
  const cursor = params.get("cursor");
  const folderId = params.get("folderId") ?? undefined;

  const timeZone = resolveRequestTimeZone({
    cookie: request.cookies.get(TIME_ZONE_COOKIE)?.value,
    header: request.headers.get("x-vercel-ip-timezone"),
  });

  try {
    const page = await getLinksPageForCurrentUser(limit, cursor, true, folderId);
    return NextResponse.json({
      groups: groupLinksByDate(page.links, { timeZone }),
      nextCursor: page.nextCursor,
      total: page.total,
      timeZone,
    });
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

export async function POST(request: NextRequest) {
  let body: { url?: string; folderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return withCors(
      request,
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    );
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !isValidUrl(url)) {
    return withCors(
      request,
      NextResponse.json({ error: "Invalid or missing URL" }, { status: 400 }),
    );
  }

  const hasFolderId = body?.folderId !== undefined;
  if (hasFolderId && typeof body.folderId !== "string") {
    return withCors(
      request,
      NextResponse.json({ error: "Invalid folder" }, { status: 400 }),
    );
  }
  const folderId = hasFolderId ? (body.folderId as string) : undefined;

  try {
    const link = await createLink(
      url,
      folderId !== undefined ? { folderId } : undefined,
    );
    broadcastLinksChanged(
      link.userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return withCors(
      request,
      NextResponse.json(
        { ...serializeLink(link), moved: link.moved },
        { status: 201 },
      ),
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return withCors(
        request,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
    if (e instanceof SaveLimitError) {
      return withCors(
        request,
        NextResponse.json(
          { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
          { status: 403 },
        ),
      );
    }
    if (e instanceof FolderNotFoundError) {
      return withCors(
        request,
        NextResponse.json({ error: "Folder not found" }, { status: 404 }),
      );
    }
    throw e;
  }
}
