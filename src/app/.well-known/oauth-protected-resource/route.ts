import { auth } from "@/lib/auth";
import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { ADVERTISED_SCOPES } from "@/lib/oauth-scopes";
import { configuredOrigin, mcpResource, oauthJwksUrl } from "@/lib/oauth-issuer";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// The mcp plugin serves this document from its own request hook, at the
// site root (basePath keeps the plugin's copy off `/.well-known`). Scopes
// stay the full advertised list: clients already read identity scopes here.
async function handler(request: Request): Promise<Response> {
  const served = await auth.handler(request);
  if (!served.ok) return served;
  const body = await served.json();
  const headers = new Headers(served.headers);
  headers.delete("content-length");
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(
    JSON.stringify({
      ...body,
      resource: mcpResource(),
      authorization_servers: [configuredOrigin()],
      jwks_uri: oauthJwksUrl(),
      scopes_supported: [...ADVERTISED_SCOPES],
    }),
    { status: served.status, headers },
  );
}

export const GET = withCdnCache(handler, DISCOVERY_CACHE_CONTROL);
