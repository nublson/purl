/** Documents that tell agents where Purl's API and MCP server are. */

export function buildApiCatalog(baseUrl: string) {
  return {
    linkset: [
      {
        anchor: `${baseUrl}/api/v1`,
        "service-doc": [{ href: `${baseUrl}/docs/api`, type: "text/html" }],
      },
      {
        anchor: `${baseUrl}/api/mcp`,
        "service-doc": [{ href: `${baseUrl}/docs/mcp`, type: "text/html" }],
      },
    ],
  };
}

export function buildMcpServerCard(baseUrl: string) {
  return {
    serverInfo: { name: "purl", title: "Purl", version: "1.0.0" },
    description:
      "Save, list and organize your Purl links and folders from an AI assistant.",
    documentationUrl: `${baseUrl}/docs/mcp`,
    transport: { type: "streamable-http", endpoint: `${baseUrl}/api/mcp` },
    capabilities: { tools: { listChanged: false } },
    authentication: {
      required: true,
      schemes: ["oauth2"],
      resourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource`,
    },
  };
}

/** Link headers on the home page (RFC 8288) pointing agents at the docs. */
export const HOME_LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</docs/api>; rel="service-doc"',
  '</docs/mcp>; rel="service-doc"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(", ");
