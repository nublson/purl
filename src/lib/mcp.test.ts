import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockVerifyApiKey = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { verifyApiKey: mockVerifyApiKey } },
}));

const mockCreateLinkForUser = vi.fn();
const mockListLinksForUser = vi.fn();
const mockReadLinkForUser = vi.fn();
vi.mock("@/lib/links", () => ({
  createLinkForUser: mockCreateLinkForUser,
  listLinksForUser: mockListLinksForUser,
  readLinkForUser: mockReadLinkForUser,
}));

const mockSearchSavedContent = vi.fn();
vi.mock("@/lib/search-saved-content", () => ({
  searchSavedContent: mockSearchSavedContent,
}));

const mockBroadcast = vi.fn();
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: mockBroadcast,
}));

// serializeLink is the identity-ish passthrough so we can assert on raw fields.
vi.mock("@/lib/serialize-link", () => ({
  serializeLink: (link: unknown) => link,
}));

class MockBillingLimitError extends Error {
  feature: string;
  constructor(feature: string, message: string) {
    super(message);
    this.feature = feature;
  }
}
vi.mock("@/lib/entitlements", () => ({
  BillingLimitError: MockBillingLimitError,
}));

const {
  verifyToken,
  getUserId,
  searchContentTool,
  saveLinkTool,
  listSavedItemsTool,
  getLinkTool,
} = await import("./mcp");

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

const reqWithBearer = (token?: string) =>
  new Request("http://localhost/api/mcp", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("verifyToken", () => {
  beforeEach(() => vi.clearAllMocks());

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
});

describe("getUserId", () => {
  it("throws when no auth info is present", () => {
    expect(() => getUserId({})).toThrow("Unauthorized");
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

describe("searchContentTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls searchSavedContent with the feature:mcp tag and returns JSON", async () => {
    mockSearchSavedContent.mockResolvedValue([{ title: "Doc" }]);
    const result = await searchContentTool("user-1", { query: "react" });
    expect(mockSearchSavedContent).toHaveBeenCalledWith(
      "user-1",
      { query: "react" },
      { tags: ["feature:mcp"] },
    );
    expect(parse(result)).toEqual([{ title: "Doc" }]);
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

  it("surfaces a plan-limit error as tool error text", async () => {
    mockCreateLinkForUser.mockRejectedValue(
      new MockBillingLimitError("save", "Save limit reached"),
    );
    const result = await saveLinkTool("user-1", "https://example.com");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Plan limit reached");
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
