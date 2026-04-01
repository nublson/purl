import { getEmbeddingModel } from "@/lib/ai";
import { embedMany } from "ai";

export async function embedTextChunks(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values,
  });

  return embeddings;
}
