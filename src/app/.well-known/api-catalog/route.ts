import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { buildApiCatalog } from "@/lib/agent-discovery";

// RFC 9727. The same document for every caller, so the CDN can answer.
export const GET = withCdnCache(
  () =>
    new Response(JSON.stringify(buildApiCatalog(process.env.BASE_URL as string)), {
      headers: {
        "Content-Type": "application/linkset+json",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  DISCOVERY_CACHE_CONTROL,
);
