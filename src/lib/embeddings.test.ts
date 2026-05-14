import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getEmbeddingModel: vi.fn(),
}));

const { embed, embedMany } = await import("ai");
const { getEmbeddingModel } = await import("@/lib/ai");
const { embedQuery, embedTextChunks } = await import("./embeddings");

describe("embedQuery", () => {
  beforeEach(() => {
    vi.mocked(embed).mockReset();
    vi.mocked(getEmbeddingModel).mockReset();
  });

  it("uses the shared embedding model via embed() and returns the embedding vector", async () => {
    const model = { id: "text-embedding-3-small" };
    vi.mocked(getEmbeddingModel).mockReturnValue(model as never);
    vi.mocked(embed).mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
    } as never);

    const result = await embedQuery("my search query");

    expect(getEmbeddingModel).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith({ model, value: "my search query" });
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("forwards AI Gateway attribution on embed() when user and tags are provided", async () => {
    const model = { id: "text-embedding-3-small" };
    vi.mocked(getEmbeddingModel).mockReturnValue(model as never);
    vi.mocked(embed).mockResolvedValue({
      embedding: [0.9],
    } as never);

    await embedQuery("q", {
      user: "user-42",
      tags: ["feature:semantic-search"],
    });

    expect(embed).toHaveBeenCalledWith({
      model,
      value: "q",
      providerOptions: {
        gateway: {
          user: "user-42",
          tags: ["feature:semantic-search"],
        },
      },
    });
  });

  it("propagates errors from the embedding provider", async () => {
    vi.mocked(getEmbeddingModel).mockReturnValue({} as never);
    vi.mocked(embed).mockRejectedValue(new Error("provider error"));

    await expect(embedQuery("test")).rejects.toThrow("provider error");
  });
});

describe("embedTextChunks", () => {
  beforeEach(() => {
    vi.mocked(embedMany).mockReset();
    vi.mocked(getEmbeddingModel).mockReset();
  });

  it("returns empty embeddings without calling provider when values are empty", async () => {
    const result = await embedTextChunks([]);
    expect(result).toEqual([]);
    expect(embedMany).not.toHaveBeenCalled();
    expect(getEmbeddingModel).not.toHaveBeenCalled();
  });

  it("uses shared embedding model and returns embeddings", async () => {
    const model = { id: "model" };
    vi.mocked(getEmbeddingModel).mockReturnValue(model as never);
    vi.mocked(embedMany).mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    } as never);

    const result = await embedTextChunks(["first", "second"]);

    expect(getEmbeddingModel).toHaveBeenCalledTimes(1);
    expect(embedMany).toHaveBeenCalledWith({
      model,
      values: ["first", "second"],
    });
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("forwards AI Gateway attribution on embedMany() when user and tags are provided", async () => {
    const model = { id: "model" };
    vi.mocked(getEmbeddingModel).mockReturnValue(model as never);
    vi.mocked(embedMany).mockResolvedValue({
      embeddings: [[1]],
    } as never);

    await embedTextChunks(["chunk"], {
      user: "user-7",
      tags: ["feature:ingest"],
    });

    expect(embedMany).toHaveBeenCalledWith({
      model,
      values: ["chunk"],
      providerOptions: {
        gateway: {
          user: "user-7",
          tags: ["feature:ingest"],
        },
      },
    });
  });
});
