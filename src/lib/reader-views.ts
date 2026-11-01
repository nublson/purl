import "server-only";

import { MAX_LINK_SEARCH_QUERY_LENGTH } from "@/lib/limits";
import type { ContentType } from "@/generated/prisma/enums";
import prisma from "@/lib/prisma";
import type { ReaderViewStatus } from "@/utils/links";

/**
 * A `to_tsquery('simple', …)` string for the user's search: each word a quoted
 * prefix lexeme joined with `&`, so no input is a tsquery syntax error. Null
 * when nothing searchable is left.
 */
export function buildReaderTsQuery(q: string): string | null {
  const words = q
    .slice(0, MAX_LINK_SEARCH_QUERY_LENGTH)
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[\\:]/g, ""))
    .filter(Boolean)
    .map((w) => `'${w.replace(/'/g, "''")}':*`);
  return words.length > 0 ? words.join(" & ") : null;
}

/** Ids of the user's links whose ready reader view matches `q` (at most 1,000). */
export async function readerLinkIdsMatching(
  userId: string,
  q: string,
): Promise<string[]> {
  const tsq = buildReaderTsQuery(q);
  if (!tsq) return [];
  const rows = await prisma.$queryRaw<{ linkId: string }[]>`
    SELECT "linkId" FROM reader_views
    WHERE "userId" = ${userId}
      AND status = 'READY'::"ReaderViewStatus"
      AND tsv @@ to_tsquery('simple', ${tsq})
    LIMIT 1000`;
  return rows.map((r) => r.linkId);
}

/**
 * Clears a failed reader view so the cron builds it again. `not_found` when the
 * link isn't the user's; `not_failed` when there's no row or it isn't FAILED.
 */
export async function resetFailedReaderView(
  userId: string,
  linkId: string,
): Promise<"reset" | "not_found" | "not_failed"> {
  const link = await prisma.link.findFirst({
    where: { id: linkId, userId },
    select: { id: true },
  });
  if (!link) return "not_found";
  const { count } = await prisma.readerView.deleteMany({
    where: { linkId, userId, status: "FAILED" },
  });
  return count === 0 ? "not_failed" : "reset";
}

/**
 * A link and its reader view row for the MCP `read_link` tool; null when the
 * link isn't the user's. `view` is null when no row exists yet.
 */
export async function readReaderViewForUser(
  userId: string,
  linkId: string,
): Promise<{
  link: {
    title: string;
    url: string;
    contentType: ContentType;
    fileKey: string | null;
    favicon: string;
    domain: string;
  };
  view: {
    status: ReaderViewStatus;
    reason: string | null;
    markdown: string | null;
    truncated: boolean;
    fetchedAt: Date | null;
  } | null;
} | null> {
  const link = await prisma.link.findFirst({
    where: { id: linkId, userId },
    select: {
      title: true,
      url: true,
      contentType: true,
      fileKey: true,
      favicon: true,
      domain: true,
    },
  });
  if (!link) return null;
  const view = await prisma.readerView.findUnique({
    where: { linkId },
    select: {
      status: true,
      reason: true,
      markdown: true,
      truncated: true,
      fetchedAt: true,
    },
  });
  return { link, view };
}
