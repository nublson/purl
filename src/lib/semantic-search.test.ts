import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings", () => ({
  embedQuery: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: vi.fn(),
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
const { semanticSearch, SimilarityThreshold } = await import("./semantic-search");

describe("semanticSearch", () => {
  beforeEach(() => {
    vi.mocked(embedQuery).mockReset();
    vi.mocked(prisma.$queryRaw).mockReset();
  });

  it("returns empty array for blank query without embedding/querying", async () => {
    const result = await semanticSearch("   ", "user-1");

    expect(result).toEqual([]);
    expect(embedQuery).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("uses default RELAXED threshold (0.25) and filters low-similarity rows", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "a", similarity: 0.8 },
      { link_id: "b", similarity: 0.24 },
      { link_id: "c", similarity: Number.NaN },
      { link_id: "d", similarity: 0.25 },
    ]);

    const result = await semanticSearch("deep work", "user-1");

    expect(embedQuery).toHaveBeenCalledWith("deep work");
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { linkId: "a", similarity: 0.8 },
      { linkId: "d", similarity: 0.25 },
    ]);
  });

  it("applies STRICT threshold and clamps matchCount", async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2]);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { link_id: "a", similarity: 0.44 },
      { link_id: "b", similarity: 0.45 },
    ]);

    const result = await semanticSearch("focus", "user-1", {
      similarityThreshold: SimilarityThreshold.STRICT,
      matchCount: 999,
      type: "PDF",
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ linkId: "b", similarity: 0.45 }]);
  });
});
