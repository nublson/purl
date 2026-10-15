import { SaveLimitError } from "@/lib/entitlements";
import { createLinkForUser } from "@/lib/links";
import { readOAuthSession } from "@/lib/mcp";
import { SAVE_SCOPE } from "@/lib/oauth-scopes";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { serializeLink } from "@/lib/serialize-link";
import { isValidUrl } from "@/utils/url";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../../cors";

/**
 * Saves one URL for the owner of a Bearer OAuth token that carries the
 * `links:save` scope. Bearer-only: cookie sessions and API keys are never
 * consulted (`readOAuthSession` reads the Authorization header alone).
 */
export async function OPTIONS(): Promise<Response> {
  return corsPreflightResponse();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readOAuthSession(request);
  const userId = session?.extra?.userId;
  if (!session || typeof userId !== "string") {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (!session.scopes.includes(SAVE_SCOPE)) {
    return addCors(
      NextResponse.json(
        { error: "This token cannot save links", code: "insufficient_scope" },
        { status: 403 }
      )
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const rawUrl =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { url?: unknown }).url
      : undefined;
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!url || !isValidUrl(url)) {
    return addCors(
      NextResponse.json({ error: "Invalid or missing URL" }, { status: 400 })
    );
  }

  try {
    const link = await createLinkForUser(userId, url);
    broadcastLinksChanged(userId);
    return addCors(
      NextResponse.json(
        { ...serializeLink(link), moved: link.moved },
        { status: 201 }
      )
    );
  } catch (e) {
    if (e instanceof SaveLimitError) {
      return addCors(
        NextResponse.json(
          { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
          { status: 403 }
        )
      );
    }
    throw e;
  }
}
