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

vi.mock("@/lib/youtube-transcriber", () => ({
  fetchYouTubeTranscript: vi.fn(),
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

vi.mock("@/lib/ingest-fail", () => ({
  failIngest: vi.fn(),
}));

vi.mock("./api-keys", () => ({
  getDecryptedApiKey: vi.fn(),
}));

import { buildMetadataText } from "@/lib/metadata-chunk";

const prisma = (await import("@/lib/prisma")).default;

const mockYoutubeLink = {
  title: "Cool Video",
  url: "https://youtu.be/abc123",
  domain: "youtu.be",
  contentType: "YOUTUBE" as const,
  description: "Channel",
};

const { fetchYouTubeTranscript } = await import("@/lib/youtube-transcriber");
const { chunkText } = await import("@/lib/chunk-text");
const { embedTextChunks } = await import("@/lib/embeddings");
const { logIngestStart, logIngestFailure } =
  await import("@/lib/ingest-logger");
const { failIngest } = await import("@/lib/ingest-fail");
const { getDecryptedApiKey } = await import("./api-keys");
const { ingestYoutube } = await import("./ingest-youtube");

describe("ingestYoutube", () => {
  beforeEach(() => {
    vi.mocked(prisma.link.update).mockReset();
    vi.mocked(prisma.linkContent.deleteMany).mockReset();
    vi.mocked(prisma.linkContent.createMany).mockReset();
    vi.mocked(prisma.linkContent.findMany).mockReset();
    vi.mocked(prisma.$executeRaw).mockReset();

    vi.mocked(fetchYouTubeTranscript).mockReset();
    vi.mocked(chunkText).mockReset();
    vi.mocked(embedTextChunks).mockReset();
    vi.mocked(logIngestStart).mockReset();
    vi.mocked(logIngestFailure).mockReset();
    vi.mocked(failIngest).mockReset();
    vi.mocked(prisma.link.findUnique).mockReset();
    vi.mocked(prisma.link.findUnique).mockResolvedValue(
      mockYoutubeLink as never,
    );

    // Default: valid API key
    vi.mocked(getDecryptedApiKey).mockResolvedValue("sk-test-key");
  });

  it("stores metadata chunk only when transcript produces no chunks", async () => {
    vi.mocked(fetchYouTubeTranscript).mockResolvedValue("[00:00:01] hello");
    vi.mocked(chunkText).mockReturnValue([]);
    vi.mocked(embedTextChunks).mockResolvedValue([[0.1, 0.2]]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-meta", chunkIndex: 0 },
    ] as never);

    await ingestYoutube({
      linkId: "link-1",
      url: "https://youtu.be/abc123",
      userId: "user-1",
    });

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING", ingestFailureReason: null },
    });
    expect(prisma.linkContent.deleteMany).toHaveBeenCalledWith({
      where: { linkId: "link-1" },
    });
    expect(embedTextChunks).toHaveBeenCalledWith(
      [buildMetadataText(mockYoutubeLink)],
      "sk-test-key",
    );
    expect(logIngestStart).toHaveBeenCalledWith(
      "YOUTUBE",
      "link-1",
      "https://youtu.be/abc123",
    );
    expect(prisma.link.update).toHaveBeenLastCalledWith({
      where: { id: "link-1" },
      data: { ingestStatus: "COMPLETED" },
    });
  });

  it("stores chunks, writes vectors, and marks completed", async () => {
    vi.mocked(fetchYouTubeTranscript).mockResolvedValue("[00:00:01] hi");
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

    await ingestYoutube({
      linkId: "link-1",
      url: "https://youtu.be/abc123",
      userId: "user-1",
    });

    expect(prisma.linkContent.createMany).toHaveBeenCalledWith({
      data: [
        {
          linkId: "link-1",
          content: buildMetadataText(mockYoutubeLink),
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

  it("marks NO_API_KEY when user has no key configured", async () => {
    vi.mocked(getDecryptedApiKey).mockRejectedValue(new Error("No API key"));

    await ingestYoutube({
      linkId: "link-1",
      url: "https://youtu.be/abc123",
      userId: "user-1",
    });

    expect(failIngest).toHaveBeenCalledWith("link-1", "NO_API_KEY");
    expect(fetchYouTubeTranscript).not.toHaveBeenCalled();
  });

  it("marks LINK_NOT_FOUND when link row is missing after transcript", async () => {
    vi.mocked(fetchYouTubeTranscript).mockResolvedValue("[00:00:01] hi");
    vi.mocked(chunkText).mockReturnValue(["c"]);
    vi.mocked(prisma.link.findUnique).mockResolvedValue(null);

    await ingestYoutube({
      linkId: "link-1",
      url: "https://youtu.be/abc123",
      userId: "user-1",
    });

    expect(failIngest).toHaveBeenCalledWith("link-1", "LINK_NOT_FOUND");
  });

  it("marks failed when transcription pipeline throws", async () => {
    vi.mocked(fetchYouTubeTranscript).mockRejectedValue(new Error("boom"));

    await expect(
      ingestYoutube({
        linkId: "link-1",
        url: "https://youtu.be/abc123",
        userId: "user-1",
      }),
    ).rejects.toThrow("boom");

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING", ingestFailureReason: null },
    });
    expect(failIngest).toHaveBeenCalledWith("link-1", "SCRAPE_FAILED");
    expect(logIngestFailure).toHaveBeenCalledWith(
      "YOUTUBE",
      "link-1",
      "https://youtu.be/abc123",
      expect.any(Error),
    );
  });
});
