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

const prisma = (await import("@/lib/prisma")).default;
const { fetchYouTubeTranscript } = await import("@/lib/youtube-transcriber");
const { chunkText } = await import("@/lib/chunk-text");
const { embedTextChunks } = await import("@/lib/embeddings");
const { logIngestStart, logIngestFailure } = await import("@/lib/ingest-logger");
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
  });

  it("marks completed and exits early when no chunks are produced", async () => {
    vi.mocked(fetchYouTubeTranscript).mockResolvedValue("[00:00:01] hello");
    vi.mocked(chunkText).mockReturnValue([]);

    await ingestYoutube({ linkId: "link-1", url: "https://youtu.be/abc123" });

    expect(prisma.link.update).toHaveBeenNthCalledWith(1, {
      where: { id: "link-1" },
      data: { ingestStatus: "PROCESSING" },
    });
    expect(prisma.linkContent.deleteMany).toHaveBeenCalledWith({
      where: { linkId: "link-1" },
    });
    expect(embedTextChunks).not.toHaveBeenCalled();
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
    ]);
    vi.mocked(prisma.linkContent.findMany).mockResolvedValue([
      { id: "row-1", chunkIndex: 0 },
      { id: "row-2", chunkIndex: 1 },
    ] as never);

    await ingestYoutube({ linkId: "link-1", url: "https://youtu.be/abc123" });

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

  it("marks failed when transcription pipeline throws", async () => {
    vi.mocked(fetchYouTubeTranscript).mockRejectedValue(new Error("boom"));

    await expect(
      ingestYoutube({ linkId: "link-1", url: "https://youtu.be/abc123" }),
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
      "YOUTUBE",
      "link-1",
      "https://youtu.be/abc123",
    );
    expect(logIngestFailure).toHaveBeenCalledWith(
      "YOUTUBE",
      "link-1",
      "https://youtu.be/abc123",
      expect.any(Error),
    );
  });
});
