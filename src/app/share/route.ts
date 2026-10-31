import { getSessionUser } from "@/lib/session";
import {
  parseShareForm,
  SHARE_LANDING,
  shareCookie,
} from "@/lib/share-target";
import { NextResponse } from "next/server";

/**
 * The Web Share Target's address (`share_target` in public/manifest.json):
 * what another app shares to the installed Purl is posted here as a
 * multipart form. The service worker answers it first in an installed app
 * (src/app/sw.ts, where the share is kept for the page in the Cache API);
 * this route answers in dev, in a browser without the worker, and when the
 * worker's stash fails. Either way it is a 303 to Home; here the share
 * travels in a short-lived cookie (`shareCookie`), never in the URL. Files
 * that reach this route can't be handed to the page: their count is, so
 * Home says they didn't arrive.
 *
 * Public in the proxy so a signed-out share is never 307'd as a POST: the
 * session is checked here, and without one the share lands on `/`.
 */

function redirectTo(path: string, request: Request): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return redirectTo("/", request);

  const form = await request.formData().catch(() => null);
  const share = form ? parseShareForm(form) : { urls: [], files: [] };
  const response = redirectTo(SHARE_LANDING, request);
  response.headers.append(
    "Set-Cookie",
    shareCookie(share, { secure: new URL(request.url).protocol === "https:" }),
  );
  return response;
}

/** Opened directly (nothing shared): just Home. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  return redirectTo(user ? "/home" : "/", request);
}
