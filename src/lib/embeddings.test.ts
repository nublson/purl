import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getEmbeddingModel: vi.fn(),
}));

const { embedMany } = await import("ai");
const { getEmbeddingModel } = await import("@/lib/ai");
const { embedTextChunks } = await import("./embeddings");

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
});
