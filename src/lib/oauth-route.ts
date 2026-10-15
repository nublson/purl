import { SAVE_SCOPE } from "@/lib/oauth-scopes";

/**
 * The origin when it is on the `OAUTH_CORS_ORIGINS` list (comma-separated,
 * trimmed, exact match; no wildcard semantics), else null.
 */
export function oauthCorsOrigin(
  origin: string | null,
  env: string | undefined = process.env.OAUTH_CORS_ORIGINS,
): string | null {
  if (!origin || !env) return null;
  const allowed = env
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

/** Answers the browser's preflight for the token endpoint. */
export function tokenPreflight(request: Request, env?: string): Response {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  });
  const origin = oauthCorsOrigin(request.headers.get("origin"), env);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(null, { status: 204, headers });
}

/**
 * Adds CORS headers to a token response for an allowed origin. Never allows
 * credentials. Copies into a new Response, since the handler's may be immutable.
 */
export function withTokenCors(
  request: Request,
  response: Response,
  env?: string,
): Response {
  const headers = new Headers(response.headers);
  headers.append("Vary", "Origin");
  const origin = oauthCorsOrigin(request.headers.get("origin"), env);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function invalidRequest(description: string): Response {
  return Response.json(
    { error: "invalid_request", error_description: description },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Save-only authorization requests must use S256 PKCE and always show the
 * consent screen. Better Auth only consents on `prompt=consent` and only checks
 * PKCE when a challenge is sent, so both are enforced here. Everything else is
 * returned untouched. Rejections are a plain 400, never a redirect, because
 * the redirect_uri isn't validated yet.
 */
export function guardSaveAuthorize(request: Request): Request | Response {
  if (request.method !== "GET") return request;
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/mcp/authorize")) return request;
  const scopes = (url.searchParams.get("scope") ?? "").split(/\s+/);
  if (!scopes.includes(SAVE_SCOPE)) return request;

  const method = url.searchParams.get("code_challenge_method");
  if (
    !url.searchParams.get("code_challenge") ||
    method?.toUpperCase() !== "S256"
  ) {
    return invalidRequest(
      "The links:save scope requires PKCE: send code_challenge and code_challenge_method=S256.",
    );
  }

  url.searchParams.set("prompt", "consent");
  return new Request(url, request);
}
