import { auth } from "@/lib/auth";
import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

// The same document for every caller (built from the configured base URL,
// no session involved): every MCP client fetches it, so the CDN answers
// instead of a function. oauth-discovery.test.ts checks it ignores the host.
export const GET = withCdnCache(
  oAuthProtectedResourceMetadata(auth),
  DISCOVERY_CACHE_CONTROL,
);
