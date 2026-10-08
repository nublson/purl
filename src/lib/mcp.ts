import "server-only";

import { auth } from "@/lib/auth";
import { parseLinkIds } from "@/lib/bulk-links";
import { SaveLimitError } from "@/lib/entitlements";
import {
  createFolder,
  deleteFolder,
  FolderDescriptionError,
  FolderEmojiError,
  FolderLimitError,
  FolderNameError,
  FolderNotFoundError,
  FolderUpdateEmptyError,
  InvalidFolderOrderError,
  reorderFolders,
  listFoldersForUser,
  updateFolder,
} from "@/lib/folders";
import {
  createLinkForUser,
  listLinksForUser,
  markLinksReadForUser,
  moveLinkToFolder,
  moveLinksToFolder,
  readLinkForUser,
} from "@/lib/links";
import { MAX_BULK_LINK_IDS } from "@/lib/limits";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
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

export async function saveLinkTool(
  userId: string,
  url: string,
  folderId?: string,
): Promise<ToolResult> {
  const trimmed = url.trim();
  if (!trimmed || !isValidUrl(trimmed)) {
    return errorContent("Invalid or missing URL.");
  }
  try {
    // A falsy `folderId` (omitted or "") means "no folder".
    const link = folderId
      ? await createLinkForUser(userId, trimmed, { folderId })
      : await createLinkForUser(userId, trimmed);
    broadcastLinksChanged(link.userId);
    return jsonContent({ ...serializeLink(link), moved: link.moved });
  } catch (e) {
    if (e instanceof SaveLimitError) {
      return errorContent(`Limit reached: ${e.message}`);
    }
    if (e instanceof FolderNotFoundError) {
      return errorContent("Folder not found");
    }
    throw e;
  }
}

export type ListSavedItemsArgs = {
  contentType?: string;
  limit?: number;
  cursor?: string;
  folderId?: string;
};

export async function listSavedItemsTool(
  userId: string,
  args: ListSavedItemsArgs,
): Promise<ToolResult> {
  try {
    const result = await listLinksForUser(userId, {
      limit: args.limit ?? 50,
      cursor: args.cursor ?? null,
      contentType: args.contentType ?? null,
      // An empty `folderId` means "no folder filter", same as omitting it.
      folderId: args.folderId || undefined,
    });
    return jsonContent({
      data: result.links.map(serializeLink),
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      return errorContent("Folder not found");
    }
    throw e;
  }
}

export async function listFoldersTool(userId: string): Promise<ToolResult> {
  const folders = await listFoldersForUser(userId);
  return jsonContent(folders);
}

/**
 * Folder errors a tool should report to the model (validation, cap, not
 * found) rather than throw; `null` for anything unexpected.
 */
function folderErrorContent(e: unknown): ToolResult | null {
  if (e instanceof FolderLimitError) {
    return errorContent(`Limit reached: ${e.message}`);
  }
  if (e instanceof FolderNotFoundError) {
    return errorContent("Folder not found");
  }
  if (e instanceof InvalidFolderOrderError) {
    return errorContent(`${e.message} Call list_folders for the current ids.`);
  }
  if (
    e instanceof FolderNameError ||
    e instanceof FolderEmojiError ||
    e instanceof FolderDescriptionError ||
    e instanceof FolderUpdateEmptyError
  ) {
    return errorContent(e.message);
  }
  return null;
}

export type CreateFolderArgs = {
  name: string;
  emoji?: string;
  description?: string;
};

export async function createFolderTool(
  userId: string,
  args: CreateFolderArgs,
): Promise<ToolResult> {
  try {
    const folder = await createFolder(
      userId,
      args.name,
      args.emoji,
      args.description,
    );
    broadcastLinksChanged(userId);
    return jsonContent(folder);
  } catch (e) {
    const content = folderErrorContent(e);
    if (content) return content;
    throw e;
  }
}

export type UpdateFolderArgs = {
  folderId: string;
  name?: string;
  emoji?: string | null;
  description?: string | null;
  isPublic?: boolean;
};

export async function updateFolderTool(
  userId: string,
  { folderId, ...input }: UpdateFolderArgs,
): Promise<ToolResult> {
  try {
    const folder = await updateFolder(userId, folderId, input);
    broadcastLinksChanged(userId);
    return jsonContent(folder);
  } catch (e) {
    const content = folderErrorContent(e);
    if (content) return content;
    throw e;
  }
}

export async function reorderFoldersTool(
  userId: string,
  ids: string[],
): Promise<ToolResult> {
  try {
    const folders = await reorderFolders(userId, ids);
    broadcastLinksChanged(userId);
    return jsonContent(folders);
  } catch (e) {
    const content = folderErrorContent(e);
    if (content) return content;
    throw e;
  }
}

export async function deleteFolderTool(
  userId: string,
  folderId: string,
  deleteLinks = false,
): Promise<ToolResult> {
  try {
    const result = await deleteFolder(userId, folderId, {
      withLinks: deleteLinks,
    });
    broadcastLinksChanged(userId);
    return jsonContent(result);
  } catch (e) {
    const content = folderErrorContent(e);
    if (content) return content;
    throw e;
  }
}

export async function moveLinkTool(
  userId: string,
  linkId: string,
  folderId: string | null,
): Promise<ToolResult> {
  try {
    // `null` or "" takes the link out of its folder.
    const link = await moveLinkToFolder(userId, linkId, folderId || null);
    if (!link) return errorContent("Not found.");
    broadcastLinksChanged(userId);
    return jsonContent(serializeLink(link));
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      return errorContent("Folder not found");
    }
    throw e;
  }
}

export async function moveLinksTool(
  userId: string,
  linkIds: string[],
  folderId: string | null,
): Promise<ToolResult> {
  const ids = parseLinkIds(linkIds);
  if (!ids.ok) return errorContent(ids.error);
  try {
    // `null` or "" takes the links out of their folders.
    const result = await moveLinksToFolder(userId, ids.ids, folderId || null);
    if (result.moved.length > 0) broadcastLinksChanged(userId);
    return jsonContent(result);
  } catch (e) {
    if (e instanceof FolderNotFoundError) {
      return errorContent("Folder not found");
    }
    throw e;
  }
}

export async function markLinksReadTool(
  userId: string,
  linkIds: string[],
  read: boolean,
): Promise<ToolResult> {
  const ids = parseLinkIds(linkIds);
  if (!ids.ok) return errorContent(ids.error);
  const updated = await markLinksReadForUser(userId, ids.ids, read);
  if (updated > 0) broadcastLinksChanged(userId);
  return jsonContent({ updated });
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
    "save_link",
    "Save a URL (web page, PDF, YouTube video, or audio) to the user's library.",
    {
      url: z.string().describe("The URL to save"),
      folderId: z
        .string()
        .optional()
        .describe("Folder id from list_folders to save into"),
    },
    async ({ url, folderId }, extra) => saveLinkTool(getUserId(extra), url, folderId),
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
          "Pagination cursor taken from a previous response's nextCursor",
        ),
      folderId: z
        .string()
        .optional()
        .describe("Folder id from list_folders to filter by"),
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

  server.tool(
    "list_folders",
    "List the user's folders (collections of saved links) in the user's order, with id, name, emoji, description, link count and position",
    {},
    async (_args, extra) => listFoldersTool(getUserId(extra)),
  );

  server.tool(
    "create_folder",
    "Create a folder to group saved links. Names are unique per user (case-insensitive).",
    {
      name: z.string().describe("Folder name (up to 60 characters)"),
      emoji: z
        .string()
        .optional()
        .describe("A single emoji for the folder (defaults to 🦪)"),
      description: z
        .string()
        .optional()
        .describe("Optional description (up to 160 characters)"),
    },
    { destructiveHint: false, idempotentHint: false },
    async (args, extra) => createFolderTool(getUserId(extra), args),
  );

  server.tool(
    "update_folder",
    "Rename a folder, change its emoji or description, or share it publicly (isPublic: true makes it readable by anyone at purl.live/@username/folder-slug, not indexed by search engines). Omitted fields are left unchanged.",
    {
      folderId: z.string().describe("Folder id from list_folders"),
      name: z.string().optional().describe("New name (up to 60 characters)"),
      emoji: z
        .string()
        .nullable()
        .optional()
        .describe("A single emoji; null or an empty string resets it to the default"),
      description: z
        .string()
        .nullable()
        .optional()
        .describe("Up to 160 characters; null or an empty string clears it"),
      isPublic: z
        .boolean()
        .optional()
        .describe("Share the folder publicly (true) or make it private again (false)"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (args, extra) => updateFolderTool(getUserId(extra), args),
  );

  server.tool(
    "delete_folder",
    "Delete a folder. Its links are kept (moved out of the folder) unless deleteLinks is true, which permanently deletes them too.",
    {
      folderId: z.string().describe("Folder id from list_folders"),
      deleteLinks: z
        .boolean()
        .optional()
        .describe("Also permanently delete the folder's links (default false)"),
    },
    { destructiveHint: true, idempotentHint: false },
    async ({ folderId, deleteLinks }, extra) =>
      deleteFolderTool(getUserId(extra), folderId, deleteLinks),
  );

  server.tool(
    "reorder_folders",
    "Set the order of the user's folders. Pass every folder id from list_folders, in the new order; the list must contain each folder exactly once.",
    {
      ids: z.array(z.string()).describe("All folder ids, first to last"),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({ ids }, extra) => reorderFoldersTool(getUserId(extra), ids),
  );

  server.tool(
    "move_link",
    "Move a saved link into a folder, or take it out of its folder.",
    {
      linkId: z.string().describe("The link id"),
      folderId: z
        .string()
        .nullable()
        .describe("Folder id from list_folders; null or an empty string removes the link from its folder"),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({ linkId, folderId }, extra) =>
      moveLinkTool(getUserId(extra), linkId, folderId),
  );

  server.tool(
    "move_links",
    `Move several saved links into a folder at once, or take them out of their folders (up to ${MAX_BULK_LINK_IDS} per call). Returns the moved links with their previous folder, and any ids that weren't found.`,
    {
      linkIds: z.array(z.string()).describe("The link ids"),
      folderId: z
        .string()
        .nullable()
        .describe("Folder id from list_folders; null or an empty string removes the links from their folders"),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({ linkIds, folderId }, extra) =>
      moveLinksTool(getUserId(extra), linkIds, folderId),
  );

  server.tool(
    "mark_links_read",
    `Mark saved links read or unread (up to ${MAX_BULK_LINK_IDS} per call). Each link's readAt is when it was read, or null while unread. Returns how many links changed.`,
    {
      linkIds: z.array(z.string()).describe("The link ids"),
      read: z.boolean().describe("true marks them read, false unread"),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({ linkIds, read }, extra) =>
      markLinksReadTool(getUserId(extra), linkIds, read),
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
  // getMcpSession does a raw DB lookup by access token with no expiry filter
  // of its own — this is the only expiry check in the auth path. Guard
  // against a malformed/missing timestamp failing open (NaN < anything is
  // false, which would otherwise treat a bad value as "not expired").
  const expiresAt = new Date(session.accessTokenExpiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return undefined;
  }
  return {
    token: session.accessToken,
    clientId: session.clientId,
    scopes: session.scopes ? session.scopes.split(" ").filter(Boolean) : [],
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
