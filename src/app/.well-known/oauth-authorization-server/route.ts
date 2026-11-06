import { auth } from "@/lib/auth";
import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { ADVERTISED_SCOPES } from "@/lib/oauth-scopes";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

const discovery = oauthProviderAuthServerMetadata(auth);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// The same document for every caller (built from the configured base URL,
// no session involved): every MCP client fetches it, so the CDN answers
// instead of a function. oauth-discovery.test.ts checks it ignores the host.
async function handler(request: Request): Promise<Response> {
  const res = await discovery(request);
  if (!res.ok) return res;
  const body = await res.json();
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(
    JSON.stringify({ ...body, scopes_supported: [...ADVERTISED_SCOPES] }),
    { status: res.status, headers },
  );
}

export const GET = withCdnCache(handler, DISCOVERY_CACHE_CONTROL);
