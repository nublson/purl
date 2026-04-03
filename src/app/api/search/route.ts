import { auth } from "@/lib/auth";
import { semanticSearch, type LinkContentType } from "@/lib/semantic-search";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const VALID_CONTENT_TYPES: LinkContentType[] = [
  "WEB",
  "PDF",
  "AUDIO",
  "YOUTUBE",
];

function parseContentType(value: string | null): LinkContentType | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (VALID_CONTENT_TYPES.includes(normalized as LinkContentType)) {
    return normalized as LinkContentType;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) {
    return NextResponse.json(
      { error: "Query must be at least 3 characters" },
      { status: 400 },
    );
  }

  const contentType = parseContentType(
    request.nextUrl.searchParams.get("type"),
  );
  const rawType = request.nextUrl.searchParams.get("type");
  if (rawType && !contentType) {
    return NextResponse.json(
      { error: "Invalid type. Use WEB, PDF, AUDIO, or YOUTUBE." },
      { status: 400 },
    );
  }

  const results = await semanticSearch(query, session.user.id, {
    type: contentType,
    matchCount: 20,
  });

  return NextResponse.json({
    results: results.map((result) => ({ linkId: result.linkId })),
  });
}
