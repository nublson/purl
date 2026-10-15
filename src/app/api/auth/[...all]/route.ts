import { auth } from "@/lib/auth";
import {
  guardSaveAuthorize,
  tokenPreflight,
  withTokenCors,
} from "@/lib/oauth-route";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

const isTokenPath = (request: Request) =>
  new URL(request.url).pathname.endsWith("/mcp/token");

export const { PATCH, PUT, DELETE } = handler;

export async function GET(request: Request) {
  const guarded = guardSaveAuthorize(request);
  if (guarded instanceof Response) return guarded;
  return handler.GET(guarded);
}

export async function POST(request: Request) {
  const response = await handler.POST(request);
  return isTokenPath(request) ? withTokenCors(request, response) : response;
}

export function OPTIONS(request: Request) {
  return isTokenPath(request)
    ? tokenPreflight(request)
    : new Response(null, { status: 204 });
}
