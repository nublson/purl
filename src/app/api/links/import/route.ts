import { parseImportBody } from "@/lib/import-body";
import { importLinksForUser } from "@/lib/import-links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { LINKS_ORIGIN_HEADER, parseLinksOrigin } from "@/lib/realtime-constants";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

/**
 * The import transaction may run up to 30 s (plus 10 s waiting to start, see
 * `IMPORT_TRANSACTION_OPTIONS` in `src/lib/import-links.ts`), so the function
 * must be allowed longer than that whatever the project's default duration is.
 */
export const maxDuration = 60;

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Imports one chunk of bookmarks: `{ links: [{ url, title, folder, createdAt }] }`
 * (at most `MAX_IMPORT_CHUNK`). Responds with the counts of what was imported
 * and skipped (`ImportLinksResult`); bad rows are counted, not errors.
 */
export async function POST(request: NextRequest) {
  // Session first: the proxy only checks a cookie exists, so the body is not
  // read or parsed for anyone who isn't signed in.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJson(request);
  if (body === undefined) {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 },
    );
  }
  const parsed = parseImportBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, code: parsed.code },
      { status: 400 },
    );
  }

  const result = await importLinksForUser(user.id, parsed.links);
  if (result.imported > 0) {
    broadcastLinksChanged(
      user.id,
      parseLinksOrigin(request.headers.get(LINKS_ORIGIN_HEADER)),
    );
  }
  return NextResponse.json(result);
}
