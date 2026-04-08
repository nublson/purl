import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings", () => ({
  embedQuery: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: vi.fn(),
    link: { findMany: vi.fn() },
  },
  Prisma: {
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
  },
}));

const { embedQuery } = await import("@/lib/embeddings");
const prisma = (await import("@/lib/prisma")).default;
const {
  semanticSearch,
  SimilarityThreshold,
  computeKeywordBoost,
} = await import("./semantic-search");

describe("computeKeywordBoost", () => {
  const baseLink = {
    title: "Untitled",
    domain: "example.com",
    description: null as string | null,
    contentType: "WEB" as const,
  };

  it("adds title boost when a query token appears in title", () => {
    expect(
      computeKeywordBoost("vlog", {
        ...baseLink,
        title: "My daily vlog",
      }),
    ).toBe(0.1);
  });

  it("adds domain boost when a query token appears in domain", () => {
    expect(
      computeKeywordBoost("vite", {
        ...baseLink,
        title: "Docs",
        domain: "vite.dev",
      }),
    ).toBe(0.05);
  });

  it("adds description boost when a query token appears in description", () => {
    expect(
      computeKeywordBoost("rust", {
        ...baseLink,
        title: "Post",
        description: "About Rust programming",
      }),
    ).toBe(0.03);
  });

  it("adds type boost when query matches content type keywords", () => {
    expect(
      computeKeywordBoost("youtube tutorials", {
        ...baseLink,
        contentType: "YOUTUBE",
      }),
    ).toBe(0.05);
  });

  it("caps total boost at 0.15", () => {
    expect(
      computeKeywordBoost("vite", {
        title: "vite guide",
        domain: "vite.dev",
        description: "vite tips",
        contentType: "WEB",
      }),
    ).toBe(0.15);
  });
});

describe("semanticSearch", () => {
  beforeEach(() => {
    vi.mocked(embedQuery).mockReset();
    vi.mocked(prisma.$queryRaw).mockReset();
    vi.mocked(prisma.link.findMany).mockReset();
  });

  it("returns empty array for blank query without embedding/querying", async () => {
    const result = await semanticSearch("   ", "user-1");

    expect(result).toEqual([]);
    expect(embedQuery).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.link.findMany).not.toHaveBeenCalled();
  });

  it("uses default BALANCED threshold (0.35) on hybrid score and filters low scores", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "a", similarity: 0.8 },
      { link_id: "b", similarity: 0.34 },
      { link_id: "c", similarity: Number.NaN },
      { link_id: "d", similarity: 0.25 },
    ]);
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      {
        id: "a",
        title: "A",
        domain: "a.com",
        description: null,
        contentType: "WEB",
      },
      {
        id: "b",
        title: "B",
        domain: "b.com",
        description: null,
        contentType: "WEB",
      },
      {
        id: "d",
        title: "D",
        domain: "d.com",
        description: null,
        contentType: "WEB",
      },
    ] as never);

    const result = await semanticSearch("deep work", "user-1");

    expect(embedQuery).toHaveBeenCalledWith("deep work");
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { linkId: "a", similarity: 0.8, vectorSimilarity: 0.8 },
    ]);
  });

  it("keyword boost can push vector score over BALANCED threshold", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "x", similarity: 0.32 },
    ]);
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      {
        id: "x",
        title: "Travel vlog EU",
        domain: "youtube.com",
        description: null,
        contentType: "YOUTUBE",
      },
    ] as never);

    const result = await semanticSearch("vlog", "user-1");

    expect(result).toHaveLength(1);
    expect(result[0]!.linkId).toBe("x");
    expect(result[0]!.vectorSimilarity).toBe(0.32);
    expect(result[0]!.similarity).toBeGreaterThanOrEqual(0.35);
  });

  it("re-ranks by hybrid score so title match beats higher vector-only score", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "vite", similarity: 0.38 },
      { link_id: "yt", similarity: 0.36 },
    ]);
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      {
        id: "vite",
        title: "Vite documentation",
        domain: "vite.dev",
        description: null,
        contentType: "WEB",
      },
      {
        id: "yt",
        title: "Daily vlog channel",
        domain: "youtube.com",
        description: null,
        contentType: "YOUTUBE",
      },
    ] as never);

    const result = await semanticSearch("vlog", "user-1");

    expect(result.map((r) => r.linkId)).toEqual(["yt", "vite"]);
    expect(result[0]!.similarity).toBeGreaterThan(result[1]!.similarity);
  });

  it("includes all saved items of inferred type when query names the type (e.g. youtube)", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "yt1", similarity: 0.55 },
    ]);
    vi.mocked(prisma.link.findMany)
      .mockResolvedValueOnce([{ id: "yt2" }] as never)
      .mockResolvedValueOnce([
        {
          id: "yt1",
          title: "First video",
          domain: "youtube.com",
          description: null,
          contentType: "YOUTUBE",
          createdAt: new Date("2024-01-01"),
        },
        {
          id: "yt2",
          title: "Second video",
          domain: "youtube.com",
          description: null,
          contentType: "YOUTUBE",
          createdAt: new Date("2024-06-01"),
        },
      ] as never);

    const result = await semanticSearch("youtube", "user-1");

    expect(result.map((r) => r.linkId).sort()).toEqual(["yt1", "yt2"].sort());
    expect(result).toHaveLength(2);
  });

  it("floors hybrid score for type-aligned links so weak vectors still pass threshold", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "yt1", similarity: 0.29 },
    ]);
    vi.mocked(prisma.link.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "yt1",
          title: "Cooking",
          domain: "youtube.com",
          description: null,
          contentType: "YOUTUBE",
          createdAt: new Date(),
        },
      ] as never);

    const result = await semanticSearch("youtube", "user-1");

    expect(result).toHaveLength(1);
    expect(result[0]!.similarity).toBeGreaterThanOrEqual(0.35);
    expect(result[0]!.vectorSimilarity).toBe(0.29);
  });

  it("applies STRICT threshold and clamps matchCount", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "a", similarity: 0.44 },
      { link_id: "b", similarity: 0.45 },
    ]);
    vi.mocked(prisma.link.findMany).mockResolvedValue([
      {
        id: "a",
        title: "A",
        domain: "a.com",
        description: null,
        contentType: "WEB",
      },
      {
        id: "b",
        title: "B",
        domain: "b.com",
        description: null,
        contentType: "WEB",
      },
    ] as never);

    const result = await semanticSearch("focus", "user-1", {
      similarityThreshold: SimilarityThreshold.STRICT,
      matchCount: 999,
      type: "PDF",
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { linkId: "b", similarity: 0.45, vectorSimilarity: 0.45 },
    ]);
  });
});
