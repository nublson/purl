import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    $executeRaw: vi.fn(),
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { applyLinkContentEmbeddings } = await import(
  "./ingest-link-content-embeddings"
);

describe("applyLinkContentEmbeddings", () => {
  beforeEach(() => {
    vi.mocked(prisma.$executeRaw).mockReset();
    vi.mocked(prisma.$executeRaw).mockResolvedValue(0 as never);
  });

  it("skips $executeRaw when no rows have embeddings", async () => {
    await applyLinkContentEmbeddings(
      [{ id: "a", chunkIndex: 0 }],
      [],
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("skips $executeRaw when embeddings are missing for all rows", async () => {
    await applyLinkContentEmbeddings(
      [{ id: "a", chunkIndex: 2 }],
      [[0.1]],
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("runs one batched $executeRaw for several rows", async () => {
    await applyLinkContentEmbeddings(
      [
        { id: "row-1", chunkIndex: 0 },
        { id: "row-2", chunkIndex: 1 },
        { id: "row-3", chunkIndex: 2 },
      ],
      [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ],
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
