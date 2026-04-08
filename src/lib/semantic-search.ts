import type { ContentType } from "@/generated/prisma/enums";
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
  /** Hybrid score: vector similarity plus capped keyword boost from link metadata */
  similarity: number;
  /** Cosine-style similarity from embeddings before keyword boost */
  vectorSimilarity: number;
};

type MatchLinkChunksRow = {
  link_id: string;
  similarity: number;
};

export type LinkMetadataForBoost = {
  title: string;
  domain: string;
  description: string | null;
  contentType: ContentType;
};

const MAX_KEYWORD_BOOST = 0.15;
const TITLE_BOOST = 0.1;
const DOMAIN_BOOST = 0.05;
const TYPE_BOOST = 0.05;
const DESCRIPTION_BOOST = 0.03;

function typeMatchesQuery(normalizedQuery: string, contentType: ContentType): boolean {
  const q = normalizedQuery;
  switch (contentType) {
    case "YOUTUBE":
      return q.includes("youtube") || q.includes("youtu");
    case "PDF":
      return q.includes("pdf");
    case "AUDIO":
      return q.includes("audio") || q.includes("podcast");
    case "WEB":
      return (
        /\bweb\b/.test(q) ||
        q.includes("article") ||
        q.includes("website") ||
        q.includes("web page")
      );
    default: {
      const _exhaustive: never = contentType;
      return _exhaustive;
    }
  }
}

/** When the user query names a content kind, we can merge in all saved items of that type (not only SQL top-N). */
function inferContentTypeHintFromQuery(normalizedQuery: string): ContentType | null {
  const q = normalizedQuery.toLowerCase();
  if (q.includes("youtube") || q.includes("youtu")) return "YOUTUBE";
  if (q.includes("pdf")) return "PDF";
  if (q.includes("audio") || q.includes("podcast")) return "AUDIO";
  if (
    /\bweb\b/.test(q) ||
    q.includes("article") ||
    q.includes("website") ||
    q.includes("web page")
  ) {
    return "WEB";
  }
  return null;
}

/**
 * Lexical boost from saved link metadata (title, domain, type, description).
 * Individual signals are summed then capped at {@link MAX_KEYWORD_BOOST}.
 */
export function computeKeywordBoost(
  query: string,
  link: LinkMetadataForBoost,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return 0;

  const hayTitle = link.title.toLowerCase();
  const hayDomain = link.domain.toLowerCase();
  const hayDesc = (link.description ?? "").toLowerCase();

  const tokenMatches = (hay: string) => tokens.some((t) => hay.includes(t));

  let boost = 0;
  if (tokenMatches(hayTitle)) boost += TITLE_BOOST;
  if (tokenMatches(hayDomain)) boost += DOMAIN_BOOST;
  if (tokenMatches(hayDesc)) boost += DESCRIPTION_BOOST;
  if (typeMatchesQuery(q, link.contentType)) boost += TYPE_BOOST;

  return Math.min(boost, MAX_KEYWORD_BOOST);
}

function isMissingFunctionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2010" &&
    typeof error.message === "string" &&
    error.message.includes("Code: `42883`")
  );
}

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

  try {
    const embedding = await embedQuery(normalizedQuery);
    const embeddingVector = JSON.stringify(embedding);
    const resultLimit = Math.max(1, Math.min(options?.matchCount ?? 20, 50));
    /** Wider pool so multiple same-type items (e.g. two YouTube saves) are not crowded out by unrelated links. */
    const vectorFetchLimit = 50;
    const threshold = options?.similarityThreshold ?? SimilarityThreshold.BALANCED;
    const minSimilarity = Number(threshold);
    const contentType = options?.type ?? null;
    const dateFrom = options?.dateFrom ?? null;
    const dateTo = options?.dateTo ?? null;

    let rows: MatchLinkChunksRow[];
    try {
      rows = await prisma.$queryRaw<MatchLinkChunksRow[]>(
        Prisma.sql`
          SELECT * FROM match_link_chunks(
            ${embeddingVector}::vector,
            ${userId}::text,
            ${vectorFetchLimit}::integer,
            ${contentType}::text,
            ${dateFrom}::timestamptz,
            ${dateTo}::timestamptz
          )
        `,
      );
    } catch (error) {
      const shouldTryLegacyFallback =
        isMissingFunctionError(error) && dateFrom === null && dateTo === null;
      if (!shouldTryLegacyFallback) {
        throw error;
      }

      rows = await prisma.$queryRaw<MatchLinkChunksRow[]>(
        Prisma.sql`
          SELECT * FROM match_link_chunks(
            ${embeddingVector}::vector,
            ${userId}::text,
            ${vectorFetchLimit}::integer,
            ${contentType}::text
          )
        `,
      );
    }

    const vectorCandidates = rows
      .map((row) => ({
        linkId: row.link_id,
        vectorSimilarity: Number(row.similarity),
      }))
      .filter((row) => Number.isFinite(row.vectorSimilarity));

    const vectorByLinkId = new Map(
      vectorCandidates.map((c) => [c.linkId, c.vectorSimilarity]),
    );
    const vectorIds = [...vectorByLinkId.keys()];

    const typeHint = inferContentTypeHintFromQuery(normalizedQuery);
    const applyTypeBackfill =
      typeHint !== null && (contentType === null || contentType === typeHint);

    let backfillIds: string[] = [];
    if (applyTypeBackfill && vectorIds.length > 0) {
      const extras = await prisma.link.findMany({
        where: {
          userId,
          contentType: typeHint,
          ingestStatus: "COMPLETED",
          contents: { some: {} },
          id: { notIn: vectorIds },
        },
        select: { id: true },
      });
      backfillIds = extras.map((e) => e.id);
    } else if (applyTypeBackfill && vectorIds.length === 0) {
      const extras = await prisma.link.findMany({
        where: {
          userId,
          contentType: typeHint,
          ingestStatus: "COMPLETED",
          contents: { some: {} },
        },
        select: { id: true },
      });
      backfillIds = extras.map((e) => e.id);
    }

    const allLinkIds = [...new Set([...vectorIds, ...backfillIds])];
    if (allLinkIds.length === 0) return [];

    const links = await prisma.link.findMany({
      where: { id: { in: allLinkIds }, userId },
      select: {
        id: true,
        title: true,
        domain: true,
        description: true,
        contentType: true,
        createdAt: true,
      },
    });

    const linkById = new Map(links.map((l) => [l.id, l]));
    const queryLower = normalizedQuery.toLowerCase();

    const scored: LinkSearchResult[] = [];

    for (const linkId of allLinkIds) {
      const row = linkById.get(linkId);
      if (!row) continue;
      const meta: LinkMetadataForBoost = {
        title: row.title,
        domain: row.domain,
        description: row.description,
        contentType: row.contentType,
      };
      const keywordBoost = computeKeywordBoost(normalizedQuery, meta);
      const fromVector = vectorByLinkId.get(linkId);
      const vectorSimilarity =
        fromVector !== undefined
          ? fromVector
          : Math.max(0, minSimilarity - keywordBoost);
      let similarity = vectorSimilarity + keywordBoost;
      if (typeMatchesQuery(queryLower, meta.contentType)) {
        similarity = Math.max(similarity, minSimilarity);
      }
      if (similarity < minSimilarity) continue;
      scored.push({ linkId, similarity, vectorSimilarity });
    }

    scored.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      const ca = linkById.get(a.linkId)?.createdAt.getTime() ?? 0;
      const cb = linkById.get(b.linkId)?.createdAt.getTime() ?? 0;
      return cb - ca;
    });

    return scored.slice(0, resultLimit);
  } catch (error) {
    throw error;
  }
}
