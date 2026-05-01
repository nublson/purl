import { getEmbeddingModel } from "@/lib/ai";
import { embed, embedMany } from "ai";

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
  });

  return embedding;
}

export async function embedTextChunks(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values,
  });

  return embeddings;
}
