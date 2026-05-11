import { getEmbeddingModel } from "@/lib/ai";
import { embed, embedMany } from "ai";

export type EmbedOptions = {
  user?: string;
  tags?: string[];
};

export async function embedQuery(
  text: string,
  options?: EmbedOptions,
): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
    ...(options && {
      providerOptions: { gateway: { user: options.user, tags: options.tags } },
    }),
  });

  return embedding;
}

export async function embedTextChunks(
  values: string[],
  options?: EmbedOptions,
): Promise<number[][]> {
  if (values.length === 0) return [];

  const { embeddings } = await embedMany({
    model: getEmbeddingModel(),
    values,
    ...(options && {
      providerOptions: { gateway: { user: options.user, tags: options.tags } },
    }),
  });

  return embeddings;
}
