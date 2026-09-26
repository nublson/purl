import { SaveLimitError } from "@/lib/entitlements";
import {
  createLink,
  getLinksPageForCurrentUser,
  UnauthorizedError,
} from "@/lib/links";
import { HOME_LINKS_PAGE_SIZE, MAX_SAVED_LINKS } from "@/lib/limits";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { serializeLink } from "@/lib/serialize-link";
import { groupLinksByDate } from "@/utils/links";
import { isValidUrl } from "@/utils/url";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin") ?? "";
  if (origin.startsWith("chrome-extension://") || ALLOWED_ORIGINS.has(origin)) {
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

  try {
    const page = await getLinksPageForCurrentUser(limit, cursor, true);
    return NextResponse.json({
      groups: groupLinksByDate(page.links, { timeZone: "UTC" }),
      nextCursor: page.nextCursor,
      total: page.total,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(request: NextRequest) {
  let body: { url?: string };
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

  try {
    const link = await createLink(url);
    broadcastLinksChanged(
      link.userId,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
    return withCors(
      request,
      NextResponse.json(serializeLink(link), { status: 201 }),
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
    throw e;
  }
}
