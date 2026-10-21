import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockVerifyApiKey = vi.fn();
const mockGetMcpSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { verifyApiKey: mockVerifyApiKey, getMcpSession: mockGetMcpSession } },
}));

const mockCreateLinkForUser = vi.fn();
const mockListLinksForUser = vi.fn();
const mockReadLinkForUser = vi.fn();
const mockMoveLinkToFolder = vi.fn();
const mockMoveLinksToFolder = vi.fn();
const mockDeleteLinksForUser = vi.fn();
const mockListLinksForResource = vi.fn();
const mockCountLinksForUser = vi.fn();
vi.mock("@/lib/links", () => ({
  listLinksForResource: mockListLinksForResource,
  countLinksForUser: mockCountLinksForUser,
  deleteLinksForUser: mockDeleteLinksForUser,
  moveLinksToFolder: mockMoveLinksToFolder,
  createLinkForUser: mockCreateLinkForUser,
  listLinksForUser: mockListLinksForUser,
  readLinkForUser: mockReadLinkForUser,
  moveLinkToFolder: mockMoveLinkToFolder,
}));

const mockListFoldersForUser = vi.fn();
const mockGetFolderById = vi.fn();
const mockCreateFolder = vi.fn();
const mockUpdateFolder = vi.fn();
const mockDeleteFolder = vi.fn();
const mockReorderFolders = vi.fn();
class MockFolderNotFoundError extends Error {
  constructor() { super("Folder not found."); }
}
class MockFolderNameError extends Error {}
class MockFolderEmojiError extends Error {}
class MockFolderDescriptionError extends Error {}
class MockFolderUpdateEmptyError extends Error {}
class MockFolderLimitError extends Error {}
class MockInvalidFolderOrderError extends Error {
  constructor() { super("The order must list each of your folders exactly once."); }
}
vi.mock("@/lib/folders", () => ({
  listFoldersForUser: mockListFoldersForUser,
  getFolderById: mockGetFolderById,
  createFolder: mockCreateFolder,
  updateFolder: mockUpdateFolder,
  deleteFolder: mockDeleteFolder,
  reorderFolders: mockReorderFolders,
  InvalidFolderOrderError: MockInvalidFolderOrderError,
  FolderNotFoundError: MockFolderNotFoundError,
  FolderNameError: MockFolderNameError,
  FolderEmojiError: MockFolderEmojiError,
  FolderDescriptionError: MockFolderDescriptionError,
  FolderUpdateEmptyError: MockFolderUpdateEmptyError,
  FolderLimitError: MockFolderLimitError,
}));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

// serializeLink is the identity-ish passthrough so we can assert on raw fields.
vi.mock("@/lib/serialize-link", () => ({
  serializeLink: (link: unknown) => link,
}));

class MockSaveLimitError extends Error {
  readonly feature = "SAVE_LIMIT";
}
vi.mock("@/lib/entitlements", () => ({
  SaveLimitError: MockSaveLimitError,
}));

const {
  verifyToken,
  getUserId,
  registerPurlTools,
  registerPurlResources,
  saveLinkTool,
  listSavedItemsTool,
  getLinkTool,
  deleteLinkTool,
  listFoldersTool,
  createFolderTool,
  updateFolderTool,
  deleteFolderTool,
  reorderFoldersTool,
  moveLinkTool,
  moveLinksTool,
} = await import("./mcp");
const { renderAllLinksResource, renderFolderResource } = await import(
  "./mcp-resources"
);

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

const reqWithBearer = (token?: string) =>
  new Request("http://localhost/api/mcp", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("registerPurlTools", () => {
  it("registers the MCP tools on the server", () => {
    const registered: string[] = [];
    const mockServer = {
      tool: vi.fn((name: string) => {
        registered.push(name);
      }),
    };
    registerPurlTools(mockServer as never);
    expect(registered).toEqual([
      "save_link",
      "list_saved_items",
      "get_link",
      "delete_link",
      "list_folders",
      "create_folder",
      "update_folder",
      "delete_folder",
      "reorder_folders",
      "move_link",
      "move_links",
    ]);
  });

  it("registered tool handlers reject requests without authInfo", async () => {
    const handlers: Array<
      (args: unknown, extra: unknown) => Promise<unknown>
    > = [];
    const mockServer = {
      // The handler is always the last argument (after an optional
      // annotations object).
      tool: vi.fn((...args: unknown[]) => {
        handlers.push(
          args.at(-1) as (args: unknown, extra: unknown) => Promise<unknown>,
        );
      }),
    };
    registerPurlTools(mockServer as never);

    for (const handler of handlers) {
      await expect(handler({}, {})).rejects.toThrow("Unauthorized");
    }
  });
});

describe("registerPurlResources", () => {
  const extra = { authInfo: { extra: { userId: "user-1" } } };
  const now = new Date("2026-10-21T12:00:00Z");
  const folderA = {
    id: "A",
    name: "Reading",
    slug: "reading",
    emoji: "📚",
    description: "Articles",
    isPublic: false,
    position: 1,
    linkCount: 2,
  };
  const folderB = {
    ...folderA,
    id: "B",
    name: "Pods",
    slug: "pods",
    emoji: "🎧",
    description: null,
    position: 2,
    linkCount: 0,
  };
  const link = {
    url: "https://example.com/a",
    title: "A link",
    description: "About it",
    domain: "example.com",
    contentType: "WEB" as const,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    folder: { name: "Reading", emoji: "📚" },
  };

  type Handler = (...args: unknown[]) => Promise<{
    resources: unknown[];
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }>;
  type Registered = {
    name: string;
    template: {
      uriTemplate: { toString(): string };
      listCallback: Handler | undefined;
    };
    read: Handler;
  };

  function register(): Registered[] {
    const calls: unknown[][] = [];
    const server = {
      registerResource: vi.fn((...args: unknown[]) => {
        calls.push(args);
      }),
    };
    registerPurlResources(server as never);
    return calls.map((args) => ({
      name: args[0] as string,
      template: args[1] as Registered["template"],
      read: args[3] as Handler,
    }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockGetFolderById.mockReset();
    mockListLinksForResource.mockReset();
    mockCountLinksForUser.mockReset();
    mockListFoldersForUser.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers All links before the folder template", () => {
    const registered = register();
    expect(registered.map((r) => r.name)).toEqual(["all_links", "folder"]);
    for (const r of registered) {
      expect(r.template).toBeInstanceOf(ResourceTemplate);
    }
    expect(registered.map((r) => r.template.uriTemplate.toString())).toEqual([
      "purl://links",
      "purl://folders/{folderId}",
    ]);
  });

  it("lists All links first, then folders in order", async () => {
    mockCountLinksForUser.mockResolvedValue(3);
    mockListFoldersForUser.mockResolvedValue([folderA, folderB]);
    const registered = register();
    const resources = [];
    for (const r of registered) {
      const result = await r.template.listCallback!(extra);
      resources.push(...result.resources);
    }
    expect(resources).toEqual([
      {
        uri: "purl://links",
        name: "🏠 All links",
        title: "🏠 All links",
        description: "Every link you've saved, newest first (3 links)",
        mimeType: "text/markdown",
      },
      {
        uri: "purl://folders/A",
        name: "📚 Reading",
        title: "📚 Reading",
        description: "Articles · 2 links",
        mimeType: "text/markdown",
      },
      {
        uri: "purl://folders/B",
        name: "🎧 Pods",
        title: "🎧 Pods",
        description: "0 links",
        mimeType: "text/markdown",
      },
    ]);
  });

  it("reads a folder", async () => {
    mockGetFolderById.mockResolvedValue(folderA);
    mockListLinksForResource.mockResolvedValue([link]);
    const [, folder] = register();
    const result = await folder.read(
      new URL("purl://folders/A"),
      { folderId: "A" },
      extra,
    );
    expect(mockGetFolderById).toHaveBeenCalledWith("user-1", "A");
    expect(mockListLinksForResource).toHaveBeenCalledWith("user-1", {
      folderId: "A",
    });
    expect(result.contents).toEqual([
      {
        uri: "purl://folders/A",
        mimeType: "text/markdown",
        text: renderFolderResource(folderA, [link], now),
      },
    ]);
  });

  it("reads All links", async () => {
    mockListLinksForResource.mockResolvedValue([link]);
    const [all] = register();
    const result = await all.read(new URL("purl://links"), {}, extra);
    expect(mockListLinksForResource).toHaveBeenCalledWith("user-1", {});
    expect(result.contents[0]).toEqual({
      uri: "purl://links",
      mimeType: "text/markdown",
      text: renderAllLinksResource([link], now),
    });
  });

  it("rejects a foreign folder", async () => {
    mockGetFolderById.mockResolvedValue(null);
    const [, folder] = register();
    const err = await folder
      .read(new URL("purl://folders/nope"), { folderId: "nope" }, extra)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(-32002);
    expect((err as McpError).message).toContain("Folder not found");
    expect(mockListLinksForResource).not.toHaveBeenCalled();
  });

  it("rejects requests without authInfo", async () => {
    const registered = register();
    for (const r of registered) {
      await expect(r.template.listCallback!({})).rejects.toThrow(
        "Unauthorized",
      );
      await expect(
        r.read(new URL("purl://links"), { folderId: "A" }, {}),
      ).rejects.toThrow("Unauthorized");
    }
  });
});

describe("registerPurlResources through a real server", () => {
  async function connect() {
    const server = new McpServer({ name: "purl", version: "test" });
    registerPurlResources(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const originalSend = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, options) =>
      originalSend(message, {
        ...options,
        authInfo: { token: "t", clientId: "c", scopes: [], extra: { userId: "user-1" } },
      });
    const client = new Client({ name: "test-client", version: "test" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, server };
  }

  const folder = (id: string, name: string) => ({
    id,
    name,
    slug: name.toLowerCase(),
    emoji: "📚",
    description: null,
    isPublic: false,
    position: 1,
    linkCount: 0,
  });

  beforeEach(() => {
    mockCountLinksForUser.mockResolvedValue(3);
    mockListFoldersForUser.mockResolvedValue([folder("A", "Reading"), folder("B", "Pods")]);
    mockListLinksForResource.mockResolvedValue([]);
  });

  it("lists all links first, then folders in order", async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual([
      "purl://links",
      "purl://folders/A",
      "purl://folders/B",
    ]);
    expect(resources[0].name).toBe("🏠 All links");
    await client.close();
  });

  it("reads all links as Markdown", async () => {
    const { client } = await connect();
    const result = await client.readResource({ uri: "purl://links" });
    const content = result.contents[0] as { text: string };
    expect(content.text.startsWith("# 🏠 All links")).toBe(true);
    await client.close();
  });

  it("rejects a missing folder with -32002", async () => {
    mockGetFolderById.mockResolvedValue(null);
    const { client } = await connect();
    await expect(client.readResource({ uri: "purl://folders/missing" })).rejects.toMatchObject({
      code: -32002,
    });
    await client.close();
  });

  it("rejects an unmatched URI with -32602", async () => {
    const { client } = await connect();
    await expect(client.readResource({ uri: "purl://folders/" })).rejects.toMatchObject({
      code: -32602,
    });
    await client.close();
  });
});

describe("verifyToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyApiKey.mockReset();
    mockGetMcpSession.mockReset();
  });

  it("returns undefined when no bearer token is provided", async () => {
    expect(await verifyToken(reqWithBearer(), undefined)).toBeUndefined();
    expect(mockVerifyApiKey).not.toHaveBeenCalled();
  });

  it("returns undefined when the key is invalid", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    expect(await verifyToken(reqWithBearer("bad"), "bad")).toBeUndefined();
  });

  it("returns AuthInfo carrying the owning user id on a valid key", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: "key-1", referenceId: "user-1" },
    });
    const info = await verifyToken(reqWithBearer("purl_x"), "purl_x");
    expect(info).toMatchObject({
      token: "purl_x",
      clientId: "key-1",
      extra: { userId: "user-1" },
    });
  });

  it("does not call getMcpSession when the API key is valid", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: "key-1", referenceId: "user-1" },
    });
    await verifyToken(reqWithBearer("purl_x"), "purl_x");
    expect(mockGetMcpSession).not.toHaveBeenCalled();
  });

  it("falls back to an OAuth session when the key is not a valid API key", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "oauth-token-1",
      clientId: "client-1",
      userId: "user-2",
      scopes: "openid profile",
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const info = await verifyToken(reqWithBearer("oauth-token-1"), "oauth-token-1");
    expect(info).toMatchObject({
      token: "oauth-token-1",
      clientId: "client-1",
      scopes: ["openid", "profile"],
      extra: { userId: "user-2" },
    });
  });

  it.each(["links:save offline_access", "openid links:save"])(
    "rejects an OAuth token whose scopes include links:save (%s)",
    async (scopes) => {
      mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
      mockGetMcpSession.mockResolvedValue({
        accessToken: "save-only-token",
        clientId: "client-1",
        userId: "user-2",
        scopes,
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(
        await verifyToken(reqWithBearer("save-only-token"), "save-only-token"),
      ).toBeUndefined();
    },
  );

  it("still accepts an OAuth token with scopes openid offline_access", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "mcp-token",
      clientId: "client-1",
      userId: "user-2",
      scopes: "openid offline_access",
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const info = await verifyToken(reqWithBearer("mcp-token"), "mcp-token");
    expect(info).toMatchObject({ extra: { userId: "user-2" } });
  });

  it("returns undefined when no OAuth session is found", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue(null);
    expect(await verifyToken(reqWithBearer("bad"), "bad")).toBeUndefined();
  });

  it("returns undefined when the OAuth access token is expired", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "expired-token",
      clientId: "client-1",
      userId: "user-2",
      scopes: "openid",
      accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(
      await verifyToken(reqWithBearer("expired-token"), "expired-token"),
    ).toBeUndefined();
  });

  it.each([
    ["missing", undefined],
    ["empty string", ""],
    ["non-date string", "not-a-date"],
  ])(
    "returns undefined when OAuth accessTokenExpiresAt is %s (fail closed)",
    async (_label, accessTokenExpiresAt) => {
      mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
      mockGetMcpSession.mockResolvedValue({
        accessToken: "token-with-bad-expiry",
        clientId: "client-1",
        userId: "user-2",
        scopes: "openid",
        accessTokenExpiresAt,
      });
      expect(
        await verifyToken(
          reqWithBearer("token-with-bad-expiry"),
          "token-with-bad-expiry",
        ),
      ).toBeUndefined();
    },
  );

  it("returns undefined when the OAuth session has no userId", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "oauth-token-1",
      clientId: "client-1",
      userId: "",
      scopes: "openid",
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(
      await verifyToken(reqWithBearer("oauth-token-1"), "oauth-token-1"),
    ).toBeUndefined();
  });

  it("treats missing OAuth scopes as an empty array", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockResolvedValue({
      accessToken: "oauth-token-1",
      clientId: "client-1",
      userId: "user-2",
      scopes: null,
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const info = await verifyToken(reqWithBearer("oauth-token-1"), "oauth-token-1");
    expect(info?.scopes).toEqual([]);
  });

  it("falls back to OAuth when verifyApiKey throws instead of crashing", async () => {
    mockVerifyApiKey.mockRejectedValue(new Error("Invalid API key."));
    mockGetMcpSession.mockResolvedValue(null);
    expect(
      await verifyToken(reqWithBearer("maybe-oauth-token"), "maybe-oauth-token"),
    ).toBeUndefined();
    expect(mockGetMcpSession).toHaveBeenCalled();
  });

  it("returns undefined when getMcpSession throws", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
    mockGetMcpSession.mockRejectedValue(new Error("network error"));
    expect(await verifyToken(reqWithBearer("bad"), "bad")).toBeUndefined();
  });
});

describe("getUserId", () => {
  it("throws when no auth info is present", () => {
    expect(() => getUserId({})).toThrow("Unauthorized");
  });

  it("throws when auth info extra has an empty userId", () => {
    expect(() =>
      getUserId({
        authInfo: {
          token: "t",
          clientId: "c",
          scopes: [],
          extra: { userId: "" },
        },
      }),
    ).toThrow("Unauthorized");
  });

  it("returns the user id from auth info extra", () => {
    expect(
      getUserId({
        authInfo: {
          token: "t",
          clientId: "c",
          scopes: [],
          extra: { userId: "user-9" },
        },
      }),
    ).toBe("user-9");
  });
});

describe("saveLinkTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid URL without saving", async () => {
    const result = await saveLinkTool("user-1", "not a url");
    expect(result.isError).toBe(true);
    expect(mockCreateLinkForUser).not.toHaveBeenCalled();
  });

  it("saves a valid URL and broadcasts the change", async () => {
    mockCreateLinkForUser.mockResolvedValue({
      id: "link-1",
      userId: "user-1",
    });
    const result = await saveLinkTool("user-1", " https://example.com ");
    expect(mockCreateLinkForUser).toHaveBeenCalledWith(
      "user-1",
      "https://example.com",
    );
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toMatchObject({ id: "link-1" });
  });

  it("surfaces the save-limit error as tool error text", async () => {
    mockCreateLinkForUser.mockRejectedValue(
      new MockSaveLimitError("Save limit reached"),
    );
    const result = await saveLinkTool("user-1", "https://example.com");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Limit reached: Save limit reached");
  });

  it("passes folderId through to createLinkForUser", async () => {
    mockCreateLinkForUser.mockResolvedValue({
      id: "link-1",
      userId: "user-1",
    });
    await saveLinkTool("user-1", "https://example.com", "folder-1");
    expect(mockCreateLinkForUser).toHaveBeenCalledWith(
      "user-1",
      "https://example.com",
      { folderId: "folder-1" },
    );
  });

  it("treats an empty folderId as no folder", async () => {
    mockCreateLinkForUser.mockResolvedValue({
      id: "link-1",
      userId: "user-1",
      moved: false,
    });
    await saveLinkTool("user-1", "https://example.com", "");
    expect(mockCreateLinkForUser).toHaveBeenCalledWith(
      "user-1",
      "https://example.com",
    );
  });

  it("includes moved in the result", async () => {
    mockCreateLinkForUser.mockResolvedValue({
      id: "link-1",
      userId: "user-1",
      moved: true,
    });
    const result = await saveLinkTool("user-1", "https://example.com", "folder-1");
    expect(parse(result)).toMatchObject({ id: "link-1", moved: true });
  });

  it("returns a tool error for a foreign or unknown folder", async () => {
    mockCreateLinkForUser.mockRejectedValue(new MockFolderNotFoundError());
    const result = await saveLinkTool("user-1", "https://example.com", "missing");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Folder not found");
  });
});

describe("listSavedItemsTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies defaults and returns data with nextCursor", async () => {
    mockListLinksForUser.mockResolvedValue({
      links: [{ id: "link-1" }],
      nextCursor: "2025-01-01T00:00:00.000Z",
    });
    const result = await listSavedItemsTool("user-1", {});
    expect(mockListLinksForUser).toHaveBeenCalledWith("user-1", {
      limit: 50,
      cursor: null,
      contentType: null,
    });
    expect(parse(result)).toEqual({
      data: [{ id: "link-1" }],
      nextCursor: "2025-01-01T00:00:00.000Z",
    });
  });

  it("passes folderId through when provided", async () => {
    mockListLinksForUser.mockResolvedValue({ links: [], nextCursor: null });
    await listSavedItemsTool("user-1", { folderId: "folder-1" });
    expect(mockListLinksForUser).toHaveBeenCalledWith("user-1", {
      limit: 50,
      cursor: null,
      contentType: null,
      folderId: "folder-1",
    });
  });

  it("treats an empty folderId as no folder filter", async () => {
    mockListLinksForUser.mockResolvedValue({ links: [], nextCursor: null });
    await listSavedItemsTool("user-1", { folderId: "" });
    const [, opts] = mockListLinksForUser.mock.calls[0];
    expect(opts.folderId).toBeUndefined();
  });

  it("returns a tool error for a foreign or unknown folder", async () => {
    mockListLinksForUser.mockRejectedValue(new MockFolderNotFoundError());
    const result = await listSavedItemsTool("user-1", { folderId: "missing" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Folder not found");
  });
});

describe("listFoldersTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the user's folders as JSON content", async () => {
    const folders = [{ id: "f1", name: "Reading", slug: "reading", emoji: "🦪", linkCount: 3 }];
    mockListFoldersForUser.mockResolvedValue(folders);
    const result = await listFoldersTool("user-1");
    expect(mockListFoldersForUser).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual(folders);
  });
});

describe("reorderFoldersTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reorders, broadcasts, and returns the folders", async () => {
    const folders = [{ id: "b" }, { id: "a" }];
    mockReorderFolders.mockResolvedValue(folders);
    const result = await reorderFoldersTool("user-1", ["b", "a"]);
    expect(mockReorderFolders).toHaveBeenCalledWith("user-1", ["b", "a"]);
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual(folders);
  });

  it("reports a stale or partial list as a tool error pointing at list_folders", async () => {
    mockReorderFolders.mockRejectedValue(new MockInvalidFolderOrderError());
    const result = await reorderFoldersTool("user-1", ["a"]);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("exactly once");
    expect(result.content[0].text).toContain("list_folders");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("createFolderTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the folder, broadcasts, and returns it", async () => {
    const folder = { id: "f1", name: "Reading", emoji: "📚" };
    mockCreateFolder.mockResolvedValue(folder);
    const result = await createFolderTool("user-1", {
      name: "Reading",
      emoji: "📚",
      description: "Long reads",
    });
    expect(mockCreateFolder).toHaveBeenCalledWith(
      "user-1",
      "Reading",
      "📚",
      "Long reads",
    );
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual(folder);
  });

  it("reports validation errors as tool errors", async () => {
    mockCreateFolder.mockRejectedValue(
      new MockFolderNameError("You already have a folder with that name. Choose another."),
    );
    const result = await createFolderTool("user-1", { name: "Reading" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "You already have a folder with that name. Choose another.",
    );
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("reports the folder cap as a limit error", async () => {
    mockCreateFolder.mockRejectedValue(
      new MockFolderLimitError("You can have up to 100 folders."),
    );
    const result = await createFolderTool("user-1", { name: "One more" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Limit reached: You can have up to 100 folders.",
    );
  });

  it("rethrows unexpected errors", async () => {
    mockCreateFolder.mockRejectedValue(new Error("db down"));
    await expect(createFolderTool("user-1", { name: "x" })).rejects.toThrow(
      "db down",
    );
  });
});

describe("updateFolderTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only the given fields through", async () => {
    mockUpdateFolder.mockResolvedValue({ id: "f1", name: "Later" });
    const result = await updateFolderTool("user-1", {
      folderId: "f1",
      name: "Later",
      description: null,
    });
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", {
      name: "Later",
      description: null,
    });
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual({ id: "f1", name: "Later" });
  });

  it("reports an empty update and an unknown folder as tool errors", async () => {
    mockUpdateFolder.mockRejectedValueOnce(
      new MockFolderUpdateEmptyError("Nothing to update"),
    );
    const empty = await updateFolderTool("user-1", { folderId: "f1" });
    expect(empty.content[0].text).toBe("Nothing to update");

    mockUpdateFolder.mockRejectedValueOnce(new MockFolderNotFoundError());
    const missing = await updateFolderTool("user-1", {
      folderId: "nope",
      name: "x",
    });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toBe("Folder not found");
  });
});

describe("deleteLinkTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the user's link and broadcasts the change", async () => {
    mockDeleteLinksForUser.mockResolvedValue(1);
    const result = await deleteLinkTool("user-1", "link-1");
    expect(mockDeleteLinksForUser).toHaveBeenCalledWith("user-1", ["link-1"]);
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual({ deleted: true, id: "link-1" });
  });

  it("reports an unknown or foreign link as a tool error, without broadcasting", async () => {
    mockDeleteLinksForUser.mockResolvedValue(0);
    const result = await deleteLinkTool("user-1", "someone-elses");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Not found.");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("deleteFolderTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the folder's links by default", async () => {
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 0 });
    const result = await deleteFolderTool("user-1", "f1");
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: false,
    });
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual({ deletedLinks: 0 });
  });

  it("deletes the links too when asked", async () => {
    mockDeleteFolder.mockResolvedValue({ deletedLinks: 4 });
    const result = await deleteFolderTool("user-1", "f1", true);
    expect(mockDeleteFolder).toHaveBeenCalledWith("user-1", "f1", {
      withLinks: true,
    });
    expect(parse(result)).toEqual({ deletedLinks: 4 });
  });

  it("reports an unknown folder as a tool error", async () => {
    mockDeleteFolder.mockRejectedValue(new MockFolderNotFoundError());
    const result = await deleteFolderTool("user-1", "nope");
    expect(result.content[0].text).toBe("Folder not found");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("updateFolderTool – sharing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes isPublic through to make a folder public", async () => {
    mockUpdateFolder.mockResolvedValue({ id: "f1", isPublic: true });
    const out = await updateFolderTool("user-1", { folderId: "f1", isPublic: true });
    expect(mockUpdateFolder).toHaveBeenCalledWith("user-1", "f1", { isPublic: true });
    expect(parse(out)).toEqual({ id: "f1", isPublic: true });
  });
});

describe("moveLinkTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves the link into the folder", async () => {
    mockMoveLinkToFolder.mockResolvedValue({ id: "l1", folderId: "f1" });
    const result = await moveLinkTool("user-1", "l1", "f1");
    expect(mockMoveLinkToFolder).toHaveBeenCalledWith("user-1", "l1", "f1");
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(result)).toEqual({ id: "l1", folderId: "f1" });
  });

  it.each([[null], [""]])("takes the link out of its folder for %j", async (folderId) => {
    mockMoveLinkToFolder.mockResolvedValue({ id: "l1", folderId: null });
    await moveLinkTool("user-1", "l1", folderId);
    expect(mockMoveLinkToFolder).toHaveBeenCalledWith("user-1", "l1", null);
  });

  it("reports a missing link and an unknown folder as tool errors", async () => {
    mockMoveLinkToFolder.mockResolvedValueOnce(null);
    const missingLink = await moveLinkTool("user-1", "nope", "f1");
    expect(missingLink.content[0].text).toBe("Not found.");

    mockMoveLinkToFolder.mockRejectedValueOnce(new MockFolderNotFoundError());
    const missingFolder = await moveLinkTool("user-1", "l1", "nope");
    expect(missingFolder.content[0].text).toBe("Folder not found");
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe("moveLinksTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves the links, broadcasts, and returns what moved", async () => {
    const result = {
      moved: [{ id: "l1", previousFolderId: null }],
      notFound: ["l2"],
    };
    mockMoveLinksToFolder.mockResolvedValue(result);
    const out = await moveLinksTool("user-1", ["l1", "l2", "l1"], "f1");
    // Duplicates are dropped before the lib call.
    expect(mockMoveLinksToFolder).toHaveBeenCalledWith("user-1", ["l1", "l2"], "f1");
    expect(mockBroadcast).toHaveBeenCalledWith("user-1");
    expect(parse(out)).toEqual(result);
  });

  it.each([[null], [""]])("takes the links out of their folders for %j", async (folderId) => {
    mockMoveLinksToFolder.mockResolvedValue({ moved: [], notFound: ["l1"] });
    await moveLinksTool("user-1", ["l1"], folderId);
    expect(mockMoveLinksToFolder).toHaveBeenCalledWith("user-1", ["l1"], null);
    // Nothing moved: no broadcast.
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("rejects an empty list and reports an unknown folder as tool errors", async () => {
    const empty = await moveLinksTool("user-1", [], "f1");
    expect(empty.isError).toBe(true);
    expect(mockMoveLinksToFolder).not.toHaveBeenCalled();

    mockMoveLinksToFolder.mockRejectedValueOnce(new MockFolderNotFoundError());
    const missingFolder = await moveLinksTool("user-1", ["l1"], "nope");
    expect(missingFolder.content[0].text).toBe("Folder not found");
  });
});

describe("getLinkTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a not-found error when the link is missing", async () => {
    mockReadLinkForUser.mockResolvedValue(null);
    const result = await getLinkTool("user-1", "missing");
    expect(result.isError).toBe(true);
  });

  it("returns the serialized link when found", async () => {
    mockReadLinkForUser.mockResolvedValue({ id: "link-1" });
    const result = await getLinkTool("user-1", "link-1");
    expect(parse(result)).toMatchObject({ id: "link-1" });
  });
});
