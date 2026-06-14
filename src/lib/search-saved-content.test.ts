import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/entitlements", () => ({
  getEntitlementContext: vi.fn(),
}));

vi.mock("@/lib/semantic-search", () => ({
  semanticSearch: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    linkContent: { findMany: vi.fn() },
  },
  ContentType: {},
}));

const { getEntitlementContext } = await import("@/lib/entitlements");
const { semanticSearch } = await import("@/lib/semantic-search");
const prisma = (await import("@/lib/prisma")).default;
const { searchSavedContent } = await import("./search-saved-content");

const mockEntitlements = getEntitlementContext as unknown as ReturnType<
  typeof vi.fn
>;
const mockSemanticSearch = semanticSearch as unknown as ReturnType<
  typeof vi.fn
>;
const mockFindMany = prisma.linkContent.findMany as unknown as ReturnType<
  typeof vi.fn
>;

function withAccess(aiFullAccess: boolean) {
  mockEntitlements.mockResolvedValue({ entitlements: { aiFullAccess } });
}

describe("searchSavedContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns [] without calling search when aiFullAccess is false", async () => {
    withAccess(false);
    const result = await searchSavedContent("user-1", { query: "react" });
    expect(result).toEqual([]);
    expect(mockSemanticSearch).not.toHaveBeenCalled();
  });

  it("returns [] when semantic search finds nothing", async () => {
    withAccess(true);
    mockSemanticSearch.mockResolvedValue([]);
    const result = await searchSavedContent("user-1", { query: "react" });
    expect(result).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("forwards filters and the feature:mcp tag, grouping chunks by title", async () => {
    withAccess(true);
    mockSemanticSearch.mockResolvedValue([{ linkId: "l1" }, { linkId: "l2" }]);
    mockFindMany.mockResolvedValue([
      {
        content: "chunk A1",
        link: {
          title: "Doc A",
          url: "https://a.example",
          contentType: "WEB",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
      {
        content: "chunk A2",
        link: {
          title: "Doc A",
          url: "https://a.example",
          contentType: "WEB",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
      {
        content: "chunk B1",
        link: {
          title: "Doc B",
          url: "https://b.example",
          contentType: "PDF",
          createdAt: new Date("2025-02-02T00:00:00.000Z"),
        },
      },
    ]);

    const result = await searchSavedContent(
      "user-1",
      {
        query: "react",
        contentType: "WEB",
        dateFrom: "2025-01-01",
        dateTo: "2025-03-01",
        limit: 5,
      },
      { tags: ["feature:mcp"] },
    );

    expect(mockSemanticSearch).toHaveBeenCalledWith(
      "react",
      "user-1",
      expect.objectContaining({
        matchCount: 5,
        type: "WEB",
        dateFrom: new Date("2025-01-01"),
        dateTo: new Date("2025-03-01"),
        tags: ["feature:mcp"],
      }),
    );

    expect(result).toEqual([
      {
        title: "Doc A",
        url: "https://a.example",
        contentType: "WEB",
        savedAt: "2025-01-01T00:00:00.000Z",
        relevantContent: "chunk A1\n\nchunk A2",
      },
      {
        title: "Doc B",
        url: "https://b.example",
        contentType: "PDF",
        savedAt: "2025-02-02T00:00:00.000Z",
        relevantContent: "chunk B1",
      },
    ]);
  });
});
