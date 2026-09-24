import { auth } from "@/lib/auth";
import {
  PDF_PROXY_MAX_RESPONSE_BYTES,
  UnsafeOutboundUrlError,
  limitReadableStreamByBytes,
  safeFetch,
} from "@/lib/safe-outbound-fetch";
import { createSignedFileUrlForLink, UploadStorageError } from "@/lib/upload-file";
import { NextRequest, NextResponse } from "next/server";

/**
 * Uploaded PDFs are passed as `?linkId=` (their stable app URL needs the
 * session, which safeFetch does not forward). Ownership is checked and a
 * fresh signed storage URL is fetched through the same safeFetch path.
 */
async function resolveUploadedPdfUrl(
  request: NextRequest,
  linkId: string,
): Promise<string | NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const signedUrl = await createSignedFileUrlForLink(userId, linkId);
    if (!signedUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return signedUrl;
  } catch (e) {
    if (e instanceof UploadStorageError) {
      return NextResponse.json({ error: "Failed to access file" }, { status: 502 });
    }
    throw e;
  }
}

export async function GET(request: NextRequest) {
  const linkId = request.nextUrl.searchParams.get("linkId")?.trim() ?? "";
  let sourceUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (linkId) {
    const resolved = await resolveUploadedPdfUrl(request, linkId);
    if (resolved instanceof NextResponse) return resolved;
    sourceUrl = resolved;
  }
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
