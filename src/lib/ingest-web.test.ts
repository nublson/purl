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
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
  },
}));

vi.mock("@/lib/web-scraper", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/web-scraper")>(
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

vi.mock("@/lib/ingest-logger", () => ({
  logIngestStart: vi.fn(),
  logIngestFailure: vi.fn(),
}));

vi.mock("@/lib/ingest-skip", () => ({
  skipIngest: vi.fn(),
}));

import { buildMetadataText } from "@/lib/metadata-chunk";

const prisma = (await import("@/lib/prisma")).default;

const mockWebLink = {
  title: "Article",
  url: "https://example.com/article",
  domain: "example.com",
  contentType: "WEB" as const,
  description: "OG description",
};
const { scrapeWebContent, UnsupportedSpaError } =
  await import("@/lib/web-scraper");
const { chunkText } = await import("@/lib/chunk-text");
const { embedTextChunks } = await import("@/lib/embeddings");
const { logIngestStart, logIngestFailure } =
  await import("@/lib/ingest-logger");
const { skipIngest } = await import("@/lib/ingest-skip");
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
    vi.mocked(logIngestStart).mockReset();
    vi.mocked(logIngestFailure).mockReset();
    vi.mocked(skipIngest).mockReset();
    vi.mocked(prisma.link.findUnique).mockReset();
    vi.mocked(prisma.link.findUnique).mockResolvedValue(mockWebLink as never);
  });

  it("stores metadata chunk only when body produces no chunks", async () => {
    vi.mocked(scrapeWebContent).mockResolvedValue("some text");
    vi.mocked(chunkText).mockReturnValue([]);
    vi.mocked(embedTextChunks).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-meta", chunkIndex: 0 },
    ] as never);

    await ingestWeb({
      linkId: "link-1",
      url: "https://example.com/article",
      userId: "user-1",
    });

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING" },
    });
    expect(prisma.linkContent.deleteMany).toHaveBeenCalledWith({
      where: { linkId: "link-1" },
    });
    expect(embedTextChunks).toHaveBeenCalledWith([
      buildMetadataText(mockWebLink),
    ]);
    expect(logIngestStart).toHaveBeenCalledWith(
      "WEB",
      "link-1",
      "https://example.com/article",
    );
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
      [0.5, 0.6],
    ]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-1", chunkIndex: 0 },
      { id: "row-2", chunkIndex: 1 },
      { id: "row-3", chunkIndex: 2 },
    ] as never);

    await ingestWeb({
      linkId: "link-1",
      url: "https://example.com/article",
      userId: "user-1",
    });

    expect(prisma.linkContent.createMany).toHaveBeenCalledWith({
      data: [
        {
          linkId: "link-1",
          content: buildMetadataText(mockWebLink),
          chunkIndex: 0,
        },
        { linkId: "link-1", content: "chunk-a", chunkIndex: 1 },
        { linkId: "link-1", content: "chunk-b", chunkIndex: 2 },
      ],
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "COMPLETED" },
    });
  });

  it("marks failed when link row is missing after scrape", async () => {
    vi.mocked(scrapeWebContent).mockResolvedValue("body");
    vi.mocked(chunkText).mockReturnValue(["c"]);
    vi.mocked(prisma.link.findUnique).mockResolvedValue(null);

    await expect(
      ingestWeb({
        linkId: "link-1",
        url: "https://example.com/article",
        userId: "user-1",
      }),
    ).rejects.toThrow("Link not found for ingest: link-1");

    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "FAILED" },
    });
  });

  it("marks failed when scraper pipeline throws", async () => {
    vi.mocked(scrapeWebContent).mockRejectedValue(new Error("boom"));

    await expect(
      ingestWeb({
        linkId: "link-1",
        url: "https://example.com/article",
        userId: "user-1",
      }),
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
      "WEB",
      "link-1",
      "https://example.com/article",
    );
    expect(logIngestFailure).toHaveBeenCalledWith(
      "WEB",
      "link-1",
      "https://example.com/article",
      expect.any(Error),
    );
  });

  it("marks skipped when scraper throws UnsupportedSpaError", async () => {
    vi.mocked(scrapeWebContent).mockRejectedValue(
      new UnsupportedSpaError("SPA not supported"),
    );

    await expect(
      ingestWeb({
        linkId: "link-1",
        url: "https://x.com/centralreality",
        userId: "user-1",
      }),
    ).resolves.toBeUndefined();

    expect(skipIngest).toHaveBeenCalledWith("link-1");
    expect(logIngestStart).toHaveBeenCalledWith(
      "WEB",
      "link-1",
      "https://x.com/centralreality",
    );
    expect(logIngestFailure).not.toHaveBeenCalled();
  });
});
