import { registerPurlTools, verifyToken } from "@/lib/mcp";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerPurlTools(server);
  },
  {
    serverInfo: { name: "purl", version: "1.0.0" },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    // Streamable HTTP only — SSE was removed from the MCP spec (2025-03-26).
    disableSse: true,
  },
);

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as DELETE, authHandler as GET, authHandler as POST };
