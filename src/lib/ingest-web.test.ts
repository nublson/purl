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

vi.mock("@/lib/web-scraper", async () => {
  const actual = await vi.importActual<typeof import("@/lib/web-scraper")>(
    "@/lib/web-scraper",
  );
  return {
    ...actual,
    scrapeWebContent: vi.fn(),
  };
});

vi.mock("@/lib/chunk-text", () => ({
  chunkText: vi.fn(),
}));

vi.mock("@/lib/embeddings", () => ({
  embedTextChunks: vi.fn(),
}));

const prisma = (await import("@/lib/prisma")).default;
const { scrapeWebContent, UnsupportedSpaError } = await import(
  "@/lib/web-scraper"
);
const { chunkText } = await import("@/lib/chunk-text");
const { embedTextChunks } = await import("@/lib/embeddings");
const { ingestWeb } = await import("./ingest-web");

describe("ingestWeb", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(prisma.linkContent.deleteMany).mockReset();
    vi.mocked(prisma.linkContent.createMany).mockReset();
    vi.mocked(prisma.linkContent.findMany).mockReset();
    vi.mocked(prisma.$executeRaw).mockReset();

    vi.mocked(scrapeWebContent).mockReset();
    vi.mocked(chunkText).mockReset();
    vi.mocked(embedTextChunks).mockReset();
  });

  it("marks completed and exits early when no chunks are produced", async () => {
    vi.mocked(scrapeWebContent).mockResolvedValue("some text");
    vi.mocked(chunkText).mockReturnValue([]);

    await ingestWeb({ linkId: "link-1", url: "https://example.com/article" });

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
    vi.mocked(scrapeWebContent).mockResolvedValue("article body");
    vi.mocked(chunkText).mockReturnValue(["chunk-a", "chunk-b"]);
    vi.mocked(embedTextChunks).mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-1", chunkIndex: 0 },
      { id: "row-2", chunkIndex: 1 },
    ] as never);

    await ingestWeb({ linkId: "link-1", url: "https://example.com/article" });

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

  it("marks failed when scraper pipeline throws", async () => {
    vi.mocked(scrapeWebContent).mockRejectedValue(new Error("boom"));

    await expect(
      ingestWeb({ linkId: "link-1", url: "https://example.com/article" }),
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

  it("marks failed when scraper throws UnsupportedSpaError", async () => {
    vi.mocked(scrapeWebContent).mockRejectedValue(
      new UnsupportedSpaError("SPA not supported"),
    );

    await expect(
      ingestWeb({ linkId: "link-1", url: "https://x.com/centralreality" }),
    ).rejects.toThrow("SPA not supported");

    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "FAILED" },
    });
  });
});
