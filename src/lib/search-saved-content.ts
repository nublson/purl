import { getEntitlementContext } from "@/lib/entitlements";
import prisma, { ContentType } from "@/lib/prisma";
import { semanticSearch } from "@/lib/semantic-search";

export type SearchSavedContentInput = {
  query: string;
  contentType?: string;
  /** ISO 8601 date string for the start of the date range. */
  dateFrom?: string;
  /** ISO 8601 date string for the end of the date range. */
  dateTo?: string;
  limit?: number;
};

export type SearchSavedContentResult = {
  title: string;
  url: string;
  contentType: string;
  savedAt: string;
  relevantContent: string;
};

/**
 * Semantic search over a user's saved content, returning chunk text grouped by
 * link title. Shared by the AI chat `searchContent` tool and the MCP server.
 *
 * Gated on `aiFullAccess` — callers without it receive an empty array (Free
 * accounts skip extraction, so there is nothing to search).
 */
export async function searchSavedContent(
  userId: string,
  input: SearchSavedContentInput,
  options?: { tags?: string[] },
): Promise<SearchSavedContentResult[]> {
  const { entitlements } = await getEntitlementContext(userId);
  if (!entitlements.aiFullAccess) {
    return [];
  }

  const { query, contentType, dateFrom, dateTo, limit } = input;

  const results = await semanticSearch(query, userId, {
    matchCount: Math.max(1, Math.min(limit ?? 10, 20)),
    type: contentType as ContentType | undefined,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    tags: options?.tags,
  });

  if (results.length === 0) return [];

  const linkIds = [...new Set(results.map((r) => r.linkId))];
  const linkContents = await prisma.linkContent.findMany({
    where: { linkId: { in: linkIds } },
    orderBy: [{ linkId: "asc" }, { chunkIndex: "asc" }],
    select: {
      content: true,
      link: {
        select: {
          title: true,
          url: true,
          contentType: true,
          createdAt: true,
        },
      },
    },
  });

  const grouped = new Map<
    string,
    {
      url: string;
      contentType: string;
      savedAt: string;
      texts: string[];
    }
  >();
  for (const c of linkContents) {
    const existing = grouped.get(c.link.title);
    if (existing) {
      existing.texts.push(c.content);
    } else {
      grouped.set(c.link.title, {
        url: c.link.url,
        contentType: c.link.contentType,
        savedAt: c.link.createdAt.toISOString(),
        texts: [c.content],
      });
    }
  }

  return Array.from(grouped.entries()).map(
    ([title, { url, contentType: type, savedAt, texts }]) => ({
      title,
      url,
      contentType: type,
      savedAt,
      relevantContent: texts.join("\n\n"),
    }),
  );
}
