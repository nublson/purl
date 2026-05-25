import { BillingLimitError } from "@/lib/entitlements";
import { createLink, UnauthorizedError } from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { serializeLink } from "@/lib/serialize-link";
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

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { error: "Invalid or missing URL" },
      { status: 400 },
    );
  }

  try {
    const link = await createLink(url);
    await broadcastLinksChanged(link.userId);
    return NextResponse.json(serializeLink(link), { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof BillingLimitError) {
      return NextResponse.json(
        {
          error: e.message,
          code: "LIMIT_REACHED",
          feature: e.feature,
        },
        { status: 402 },
      );
    }
    throw e;
  }
}
