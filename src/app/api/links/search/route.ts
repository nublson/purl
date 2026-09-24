import { LINK_SEARCH_LIMIT } from "@/lib/limits";
import { searchLinksForCurrentUser, UnauthorizedError } from "@/lib/links";
import { NextRequest, NextResponse } from "next/server";

/** Session-authenticated header search. `q` empty returns the most recent links. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  try {
    const links = await searchLinksForCurrentUser(q, LINK_SEARCH_LIMIT);
    return NextResponse.json({ links });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
}
