import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { update: vi.fn() },
    linkContent: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
  Prisma: {
    sql: vi.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      }),
    ),
  },
}));

vi.mock("@/lib/pdf-extractor", () => ({
  extractPdfTextByPage: vi.fn(),
}));

vi.mock("@/lib/chunk-text", () => ({
  chunkText: vi.fn(),
}));

vi.mock("@/lib/embeddings", () => ({
  embedTextChunks: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { extractPdfTextByPage } = await import("@/lib/pdf-extractor");
const { chunkText } = await import("@/lib/chunk-text");
const { embedTextChunks } = await import("@/lib/embeddings");
const { ingestPdf } = await import("./ingest-pdf");

describe("ingestPdf", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(prisma.linkContent.deleteMany).mockReset();
    vi.mocked(prisma.linkContent.createMany).mockReset();
    vi.mocked(prisma.linkContent.findMany).mockReset();
    vi.mocked(prisma.$executeRaw).mockReset();

    vi.mocked(extractPdfTextByPage).mockReset();
    vi.mocked(chunkText).mockReset();
    vi.mocked(embedTextChunks).mockReset();
  });

  it("marks completed and exits early when no chunks are produced", async () => {
    vi.mocked(extractPdfTextByPage).mockResolvedValue(["page text"]);
    vi.mocked(chunkText).mockReturnValue([]);

    await ingestPdf({ linkId: "link-1", url: "https://example.com/doc.pdf" });

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING" },
    });
    expect(prisma.linkContent.deleteMany).toHaveBeenCalledWith({
      where: { linkId: "link-1" },
    });
    expect(embedTextChunks).not.toHaveBeenCalled();
    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "COMPLETED" },
    });
  });

  it("stores chunks, writes vectors, and marks completed", async () => {
    vi.mocked(extractPdfTextByPage).mockResolvedValue(["page 1", "page 2"]);
    vi.mocked(chunkText).mockReturnValue(["chunk-a", "chunk-b"]);
    vi.mocked(embedTextChunks).mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-1", chunkIndex: 0 },
      { id: "row-2", chunkIndex: 1 },
    ] as never);

    await ingestPdf({ linkId: "link-1", url: "https://example.com/doc.pdf" });

    expect(prisma.linkContent.createMany).toHaveBeenCalledWith({
      data: [
        { linkId: "link-1", content: "chunk-a", chunkIndex: 0 },
        { linkId: "link-1", content: "chunk-b", chunkIndex: 1 },
      ],
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "COMPLETED" },
    });
  });

  it("marks failed when extraction pipeline throws", async () => {
    vi.mocked(extractPdfTextByPage).mockRejectedValue(new Error("boom"));

    await expect(
      ingestPdf({ linkId: "link-1", url: "https://example.com/doc.pdf" }),
    ).rejects.toThrow("boom");

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING" },
    });
    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "FAILED" },
    });
  });
});
