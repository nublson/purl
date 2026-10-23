import { SAVE_SCOPE } from "@/lib/oauth-scopes";

// Browser extensions' own pages and workers. Their ids differ per install
// (Safari's per profile), so they can't be listed: any of them may call the
// token endpoint, which needs no cookie and gives nothing without a code and
// its PKCE verifier, or a refresh token. Without this, Safari blocks the
// extension from reading the answer unless it was granted access to Purl's
// site, and a refresh reads as a network failure.
const EXTENSION_ORIGIN = /^(chrome-extension|safari-web-extension):\/\/[A-Za-z0-9-]+$/;

/**
 * The origin when it is a browser extension's or on the `OAUTH_CORS_ORIGINS`
 * list (comma-separated, trimmed, exact match; no wildcard semantics), else
 * null.
 */
export function oauthCorsOrigin(
  origin: string | null,
  env: string | undefined = process.env.OAUTH_CORS_ORIGINS,
): string | null {
  if (origin && EXTENSION_ORIGIN.test(origin)) return origin;
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

/** The nublson.com portfolio's registered OAuth client. */
export const PORTFOLIO_CLIENT_ID = "nublson-com";

/**
 * The Purl browser extension's registered OAuth clients, one per browser so
 * Connected apps names where each connection comes from ("Purl for Chrome",
 * "Purl for Safari"). Chromium browsers (Edge, Brave, …) use Chrome's.
 */
export const EXTENSION_CLIENT_IDS = [
  "purl-extension-chrome",
  "purl-extension-safari",
] as const;

/**
 * Registered clients that may only ever receive save-only tokens. Signing out
 * of Purl disconnects them all (`revokeSaveOnlyAppsOnSignOut`).
 */
export const SAVE_ONLY_CLIENT_IDS = new Set([
  PORTFOLIO_CLIENT_ID,
  ...EXTENSION_CLIENT_IDS,
]);

const SAVE_ONLY_ALLOWED_SCOPES = new Set([SAVE_SCOPE, "offline_access"]);

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
  const scopes = (url.searchParams.get("scope") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const clientId = url.searchParams.get("client_id") ?? "";
  if (SAVE_ONLY_CLIENT_IDS.has(clientId)) {
    if (
      !scopes.includes(SAVE_SCOPE) ||
      !scopes.every((s) => SAVE_ONLY_ALLOWED_SCOPES.has(s))
    ) {
      return invalidRequest(
        "This client may only request the links:save scope (and offline_access).",
      );
    }
  } else if (!scopes.includes(SAVE_SCOPE)) {
    return request;
  }

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
