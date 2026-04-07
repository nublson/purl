import prisma, { Prisma } from "@/lib/prisma";
import { embedQuery } from "@/lib/embeddings";

export type LinkContentType = "WEB" | "PDF" | "AUDIO" | "YOUTUBE";

export enum SimilarityThreshold {
  RELAXED = "0.25",
  BALANCED = "0.35",
  STRICT = "0.45",
}

export type LinkSearchResult = {
  linkId: string;
  similarity: number;
};

type MatchLinkChunksRow = {
  link_id: string;
  similarity: number;
};

export async function semanticSearch(
  query: string,
  userId: string,
  options?: {
    type?: LinkContentType;
    matchCount?: number;
    similarityThreshold?: SimilarityThreshold;
    dateFrom?: Date;
    dateTo?: Date;
  },
): Promise<LinkSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const embedding = await embedQuery(normalizedQuery);
  const embeddingVector = JSON.stringify(embedding);
  const matchCount = Math.max(1, Math.min(options?.matchCount ?? 20, 50));
  const threshold = options?.similarityThreshold ?? SimilarityThreshold.RELAXED;
  const minSimilarity = Number(threshold);
  const contentType = options?.type ?? null;
  const dateFrom = options?.dateFrom ?? null;
  const dateTo = options?.dateTo ?? null;

  const rows = await prisma.$queryRaw<MatchLinkChunksRow[]>(
    Prisma.sql`
      SELECT * FROM match_link_chunks(
        ${embeddingVector}::vector,
        ${userId},
        ${matchCount},
        ${contentType},
        ${dateFrom},
        ${dateTo}
      )
    `,
  );

  return rows
    .map((row) => ({
      linkId: row.link_id,
      similarity: Number(row.similarity),
    }))
    .filter((row) => Number.isFinite(row.similarity))
    .filter((row) => row.similarity >= minSimilarity);
}
