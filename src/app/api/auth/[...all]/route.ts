import { auth } from "@/lib/auth";
import {
  guardSaveAuthorize,
  isTokenPath,
  rewriteLegacyOAuthRequest,
  tokenPreflight,
  withTokenCors,
} from "@/lib/oauth-route";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

export const { PATCH, PUT, DELETE } = handler;

export async function GET(request: Request) {
  const guarded = guardSaveAuthorize(request);
  if (guarded instanceof Response) return guarded;
  return handler.GET(rewriteLegacyOAuthRequest(guarded));
}

export async function POST(request: Request) {
  const response = await handler.POST(rewriteLegacyOAuthRequest(request));
  return isTokenPath(new URL(request.url).pathname)
    ? withTokenCors(request, response)
    : response;
}

export function OPTIONS(request: Request) {
  return isTokenPath(new URL(request.url).pathname)
    ? tokenPreflight(request)
    : new Response(null, { status: 204 });
}
