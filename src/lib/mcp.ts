import "server-only";

import { auth } from "@/lib/auth";
import { BillingLimitError } from "@/lib/entitlements";
import {
  createLinkForUser,
  listLinksForUser,
  readLinkForUser,
} from "@/lib/links";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import {
  searchSavedContent,
  type SearchSavedContentInput,
} from "@/lib/search-saved-content";
import { serializeLink } from "@/lib/serialize-link";
import { isValidUrl } from "@/utils/url";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const contentTypeSchema = z
  .enum(["WEB", "YOUTUBE", "PDF", "AUDIO"])
  .describe("Filter by content type");

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Resolves the authenticated user id placed on the auth context by {@link verifyToken}. */
export function getUserId(extra: { authInfo?: AuthInfo }): string {
  const userId = extra.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export function jsonContent(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function errorContent(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export async function searchContentTool(
  userId: string,
  args: SearchSavedContentInput,
): Promise<ToolResult> {
  const results = await searchSavedContent(userId, args, {
    tags: ["feature:mcp"],
  });
  return jsonContent(results);
}

export async function saveLinkTool(
  userId: string,
  url: string,
): Promise<ToolResult> {
  const trimmed = url.trim();
  if (!trimmed || !isValidUrl(trimmed)) {
    return errorContent("Invalid or missing URL.");
  }
  try {
    const link = await createLinkForUser(userId, trimmed);
    await broadcastLinksChanged(link.userId);
    return jsonContent(serializeLink(link));
  } catch (e) {
    if (e instanceof BillingLimitError) {
      return errorContent(`Plan limit reached: ${e.message}`);
    }
    throw e;
  }
}

export type ListSavedItemsArgs = {
  contentType?: string;
  limit?: number;
  cursor?: string;
};

export async function listSavedItemsTool(
  userId: string,
  args: ListSavedItemsArgs,
): Promise<ToolResult> {
  const result = await listLinksForUser(userId, {
    limit: args.limit ?? 50,
    cursor: args.cursor ?? null,
    contentType: args.contentType ?? null,
  });
  return jsonContent({
    data: result.links.map(serializeLink),
    nextCursor: result.nextCursor,
  });
}

export async function getLinkTool(
  userId: string,
  id: string,
): Promise<ToolResult> {
  const link = await readLinkForUser(userId, id);
  if (!link) return errorContent("Not found.");
  return jsonContent(serializeLink(link));
}

/** Registers Purl's MCP tools on the given server instance. */
export function registerPurlTools(server: McpServer): void {
  server.tool(
    "search_content",
    "Semantic search across the user's saved content. Use for topic-based questions or when you need the actual saved content to answer. Supports optional date and type filters.",
    {
      query: z.string().describe("The search query describing the topic"),
      contentType: contentTypeSchema.optional(),
      dateFrom: z
        .string()
        .optional()
        .describe("ISO 8601 date string for the start of the date range"),
      dateTo: z
        .string()
        .optional()
        .describe("ISO 8601 date string for the end of the date range"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of items to return (1-20, default 10)"),
    },
    async (args, extra) => searchContentTool(getUserId(extra), args),
  );

  server.tool(
    "save_link",
    "Save a URL to the user's library. Purl ingests the content (web, PDF, YouTube, audio) asynchronously after saving.",
    {
      url: z.string().describe("The URL to save"),
    },
    async ({ url }, extra) => saveLinkTool(getUserId(extra), url),
  );

  server.tool(
    "list_saved_items",
    "List the user's saved items (metadata only, newest first). Supports an optional type filter and cursor pagination.",
    {
      contentType: contentTypeSchema.optional(),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of items to return (1-100, default 50)"),
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor (ISO date) taken from a previous response's nextCursor",
        ),
    },
    async (args, extra) => listSavedItemsTool(getUserId(extra), args),
  );

  server.tool(
    "get_link",
    "Fetch a single saved item by its id.",
    {
      id: z.string().describe("The link id"),
    },
    async ({ id }, extra) => getLinkTool(getUserId(extra), id),
  );
}

/** Verifies a `purl_…` API key via the apiKey plugin. */
async function verifyApiKeyToken(
  req: Request,
  bearerToken: string,
): Promise<AuthInfo | undefined> {
  let result: Awaited<ReturnType<typeof auth.api.verifyApiKey>>;
  try {
    result = await auth.api.verifyApiKey({
      body: { key: bearerToken },
      headers: req.headers,
    });
  } catch (err) {
    console.error("MCP API key verification failed:", err);
    return undefined;
  }
  if (!result.valid || !result.key) return undefined;
  return {
    token: bearerToken,
    clientId: result.key.id,
    scopes: [],
    extra: { userId: result.key.referenceId },
  };
}

/** Verifies an OAuth access token issued by Better Auth's mcp plugin. */
async function verifyOAuthToken(req: Request): Promise<AuthInfo | undefined> {
  let session: Awaited<ReturnType<typeof auth.api.getMcpSession>>;
  try {
    session = await auth.api.getMcpSession({
      request: req,
      headers: req.headers,
      asResponse: false,
    });
  } catch (err) {
    console.error("MCP OAuth token verification failed:", err);
    return undefined;
  }
  if (!session?.userId) return undefined;
  // Defense in depth: verify expiry ourselves rather than trusting the
  // endpoint to have already filtered it out.
  if (new Date(session.accessTokenExpiresAt).getTime() < Date.now()) {
    return undefined;
  }
  return {
    token: session.accessToken,
    clientId: session.clientId,
    scopes: session.scopes ? session.scopes.split(" ") : [],
    extra: { userId: session.userId },
  };
}

/**
 * Validates the `Authorization: Bearer …` header, accepting either a
 * `purl_…` API key or an OAuth access token issued via the mcp plugin's
 * Connect flow, and attaches the owning user id to the request auth context.
 */
export async function verifyToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const apiKeyInfo = await verifyApiKeyToken(req, bearerToken);
  if (apiKeyInfo) return apiKeyInfo;
  return verifyOAuthToken(req);
}
