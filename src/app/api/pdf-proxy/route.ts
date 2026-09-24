import {
  PDF_PROXY_MAX_RESPONSE_BYTES,
  UnsafeOutboundUrlError,
  limitReadableStreamByBytes,
  safeFetch,
} from "@/lib/safe-outbound-fetch";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const sourceUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing url query param" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url query param" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Unsupported URL protocol" }, { status: 400 });
  }

  try {
    const upstream = await safeFetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
      },
      cache: "no-store",
      maxResponseBytes: PDF_PROXY_MAX_RESPONSE_BYTES,
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "Failed to fetch PDF from source" },
        { status: 502 },
      );
    }

    const body = limitReadableStreamByBytes(
      upstream.body,
      PDF_PROXY_MAX_RESPONSE_BYTES,
    );

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
        "Content-Length": upstream.headers.get("content-length") ?? "",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    if (err instanceof UnsafeOutboundUrlError) {
      return NextResponse.json({ error: "URL is not allowed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected proxy error" }, { status: 500 });
  }
}
