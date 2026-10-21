import { DISCOVERY_CACHE_CONTROL, withCdnCache } from "@/lib/cdn-cache";
import { buildMcpServerCard } from "@/lib/agent-discovery";

// MCP Server Card (SEP-1649, a draft). The same document for every caller.
export const GET = withCdnCache(
  () =>
    new Response(
      JSON.stringify(buildMcpServerCard(process.env.BASE_URL as string)),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    ),
  DISCOVERY_CACHE_CONTROL,
);
