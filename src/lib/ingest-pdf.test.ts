import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    link: { update: vi.fn(), findUnique: vi.fn() },
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

vi.mock("@/lib/ingest-logger", () => ({
  logIngestStart: vi.fn(),
  logIngestFailure: vi.fn(),
}));

import { buildMetadataText } from "@/lib/metadata-chunk";

const prisma = (await import("@/lib/prisma")).default;

const mockPdfLink = {
  title: "My PDF",
  url: "https://example.com/doc.pdf",
  domain: "example.com",
  contentType: "PDF" as const,
  description: null as string | null,
};
const { extractPdfTextByPage } = await import("@/lib/pdf-extractor");
const { chunkText } = await import("@/lib/chunk-text");
const { embedTextChunks } = await import("@/lib/embeddings");
const { logIngestStart, logIngestFailure } = await import("@/lib/ingest-logger");
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
    vi.mocked(logIngestStart).mockReset();
    vi.mocked(logIngestFailure).mockReset();
    vi.mocked(prisma.link.findUnique).mockReset();
    vi.mocked(prisma.link.findUnique).mockResolvedValue(mockPdfLink as never);
  });

  it("stores metadata chunk only when body produces no chunks", async () => {
    vi.mocked(extractPdfTextByPage).mockResolvedValue(["page text"]);
    vi.mocked(chunkText).mockReturnValue([]);
    vi.mocked(embedTextChunks).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-meta", chunkIndex: 0 },
    ] as never);

    await ingestPdf({ linkId: "link-1", url: "https://example.com/doc.pdf" });

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING" },
    });
    expect(prisma.linkContent.deleteMany).toHaveBeenCalledWith({
      where: { linkId: "link-1" },
    });
    expect(embedTextChunks).toHaveBeenCalledWith([
      buildMetadataText(mockPdfLink),
    ]);
    expect(logIngestStart).toHaveBeenCalledWith(
      "PDF",
      "link-1",
      "https://example.com/doc.pdf",
    );
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
      [0.5, 0.6],
    ]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-1", chunkIndex: 0 },
      { id: "row-2", chunkIndex: 1 },
      { id: "row-3", chunkIndex: 2 },
    ] as never);

    await ingestPdf({ linkId: "link-1", url: "https://example.com/doc.pdf" });

    expect(prisma.linkContent.createMany).toHaveBeenCalledWith({
      data: [
        { linkId: "link-1", content: buildMetadataText(mockPdfLink), chunkIndex: 0 },
        { linkId: "link-1", content: "chunk-a", chunkIndex: 1 },
        { linkId: "link-1", content: "chunk-b", chunkIndex: 2 },
      ],
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
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
    expect(logIngestStart).toHaveBeenCalledWith(
      "PDF",
      "link-1",
      "https://example.com/doc.pdf",
    );
    expect(logIngestFailure).toHaveBeenCalledWith(
      "PDF",
      "link-1",
      "https://example.com/doc.pdf",
      expect.any(Error),
    );
  });
});
