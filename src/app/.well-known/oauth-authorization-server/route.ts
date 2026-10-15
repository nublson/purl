import { auth } from "@/lib/auth";
import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { ADVERTISED_SCOPES } from "@/lib/oauth-scopes";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

const discovery = oAuthDiscoveryMetadata(auth);

// The mcp plugin hardcodes scopes_supported and its `metadata` option isn't
// typed in this Better Auth version, so add the save-only scope here.
async function handler(request: Request): Promise<Response> {
  const res = await discovery(request);
  if (!res.ok) return res;
  const body = await res.json();
  const headers = new Headers(res.headers);
  headers.delete("content-length"); // the body changed size
  return new Response(
    JSON.stringify({ ...body, scopes_supported: [...ADVERTISED_SCOPES] }),
    { status: res.status, headers },
  );
}

// The same document for every caller (built from the configured base URL,
// no session involved): every MCP client fetches it, so the CDN answers
// instead of a function. oauth-discovery.test.ts checks it ignores the host.
export const GET = withCdnCache(handler, DISCOVERY_CACHE_CONTROL);
