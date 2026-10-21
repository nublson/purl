import { describe, expect, it } from "vitest";
import {
  HOME_LINK_HEADER,
  buildApiCatalog,
  buildMcpServerCard,
} from "./agent-discovery";

describe("agent discovery documents", () => {
  it("anchors the catalog on the API and MCP endpoints, with their docs", () => {
    const { linkset } = buildApiCatalog("https://purl.live");
    expect(linkset.map((e) => e.anchor)).toEqual([
      "https://purl.live/api/v1",
      "https://purl.live/api/mcp",
    ]);
    expect(linkset[0]["service-doc"][0].href).toBe("https://purl.live/docs/api");
  });

  it("points the server card at the streamable HTTP endpoint", () => {
    const card = buildMcpServerCard("https://purl.live");
    expect(card.transport).toEqual({
      type: "streamable-http",
      endpoint: "https://purl.live/api/mcp",
    });
    expect(card.authentication.resourceMetadata).toBe(
      "https://purl.live/.well-known/oauth-protected-resource",
    );
  });

  it("links the catalog, both docs and llms.txt from the home page", () => {
    expect(HOME_LINK_HEADER).toContain('rel="api-catalog"');
    expect(HOME_LINK_HEADER).toContain("</docs/mcp>");
    expect(HOME_LINK_HEADER).toContain("</llms.txt>");
  });
});
