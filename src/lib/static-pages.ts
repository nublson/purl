/**
 * The static pages whose content lives in Notion (`src/lib/notion.ts`): each
 * row's `slug` in the "Purl Pages" database and where it's served. API and
 * MCP live under /docs because /api is the API routes' namespace. Plain data,
 * so the proxy and client components can import it.
 */
export const STATIC_PAGES = [
  { slug: "api", path: "/docs/api", label: "API" },
  { slug: "mcp", path: "/docs/mcp", label: "MCP" },
  { slug: "support", path: "/support", label: "Support" },
  { slug: "privacy", path: "/privacy", label: "Privacy" },
  { slug: "terms", path: "/terms", label: "Terms" },
] as const;

export type StaticPageSlug = (typeof STATIC_PAGES)[number]["slug"];
