import { BillingLimitError } from "@/lib/entitlements";
import { createLink, listLinks, UnauthorizedError } from "@/lib/links";
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

  try {
    const result = await listLinks({ limit, cursor, contentType });
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
    throw e;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { url?: string };
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

  try {
    const link = await createLink(url);
    await broadcastLinksChanged(link.userId);
    return addCors(NextResponse.json(serializeLink(link), { status: 201 }));
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    if (e instanceof BillingLimitError) {
      return addCors(
        NextResponse.json(
          { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
          { status: 402 }
        )
      );
    }
    throw e;
  }
}
