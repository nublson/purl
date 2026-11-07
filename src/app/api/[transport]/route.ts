import { registerPurlResources, registerPurlTools, verifyToken } from "@/lib/mcp";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

export const maxDuration = 60;

// Serves the 2026-07-28 protocol natively and 2025-era Streamable HTTP
// clients through the SDK's stateless fallback, from this one route.
const handler = createMcpHandler(
  (server) => {
    registerPurlTools(server);
    registerPurlResources(server);
  },
  {
    serverInfo: { name: "purl", version: "1.0.0" },
  },
);

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as DELETE, authHandler as GET, authHandler as POST };
