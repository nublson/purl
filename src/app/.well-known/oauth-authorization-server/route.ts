import { auth } from "@/lib/auth";
import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { oAuthDiscoveryMetadata } from "better-auth/plugins";

// The same for every caller on a domain (no session involved): every MCP
// client fetches it, so the CDN answers instead of a function.
export const GET = withCdnCache(
  oAuthDiscoveryMetadata(auth),
  DISCOVERY_CACHE_CONTROL,
);
