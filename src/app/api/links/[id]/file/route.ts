import { auth } from "@/lib/auth";
import { createSignedFileUrlForLink, UploadStorageError } from "@/lib/upload-file";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Stable URL for an uploaded file. Checks ownership, then redirects to a
 * short-lived signed URL for the object in the private storage bucket.
 * Works with a browser session or a `purl_…` API key (Bearer).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let signedUrl: string | null;
  try {
    signedUrl = await createSignedFileUrlForLink(userId, id);
  } catch (e) {
    if (e instanceof UploadStorageError) {
      return NextResponse.json(
        { error: "Failed to access file" },
        { status: 502 },
      );
    }
    throw e;
  }

  if (!signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.redirect(signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
