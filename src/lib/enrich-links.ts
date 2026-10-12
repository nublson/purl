import "server-only";

import { resolveLinkFromUrl } from "@/lib/links";
import prisma from "@/lib/prisma";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { getUrlDomain } from "@/utils/formatter";

/** Links claimed per cron run (one a minute), newest first. */
export const ENRICH_BATCH_SIZE = 20;
/** Metadata lookups running at once. */
export const ENRICH_CONCURRENCY = 5;
/** A lookup that takes longer counts as failed. */
export const ENRICH_LINK_TIMEOUT_MS = 20_000;

export type EnrichResult = { claimed: number; enriched: number; failed: number };

type ClaimedLink = {
  id: string;
  userId: string;
  url: string;
  title: string;
  domain: string;
};

/**
 * The title to keep after a lookup: an imported file title is usually the one
 * the user chose, so it wins unless it's empty, the raw URL or the domain.
 */
export function enrichedTitle(
  current: string,
  url: string,
  resolvedTitle: string,
): string {
  const trimmed = current.trim();
  if (!trimmed || trimmed === url || trimmed === getUrlDomain(url)) {
    return resolvedTitle;
  }
  return current;
}

class EnrichTimeoutError extends Error {
  constructor() {
    super(`Lookup exceeded ${ENRICH_LINK_TIMEOUT_MS}ms`);
  }
}

/** Races `promise` against the timeout, clearing the timer either way. */
async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EnrichTimeoutError()), ENRICH_LINK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `task` over `items`, at most `limit` at a time. */
async function runPool<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

/**
 * Fills in the details of imported links (`needsMetadata`). Claims a batch
 * atomically (the flag is cleared at claim time, so overlapping runs never
 * share a link, and a failed lookup isn't retried: the link stays as
 * imported), looks each up, and writes the results by id, never `createdAt`,
 * in one transaction per link. Edits made while it waited win: description
 * and thumbnail are only set where still null, the title only while it's
 * still the claimed one.
 */
export async function enrichFlaggedLinks(): Promise<EnrichResult> {
  const claimedLinks = await prisma.$queryRaw<ClaimedLink[]>`
    UPDATE "links" SET "needsMetadata" = false
    WHERE "id" IN (
      SELECT "id" FROM "links" WHERE "needsMetadata" = true
      ORDER BY "createdAt" DESC LIMIT ${ENRICH_BATCH_SIZE} FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "userId", "url", "title", "domain"`;

  if (claimedLinks.length === 0) return { claimed: 0, enriched: 0, failed: 0 };

  let enriched = 0;
  let failed = 0;
  const enrichedUsers = new Set<string>();

  await runPool(claimedLinks, ENRICH_CONCURRENCY, async (link) => {
    try {
      const resolved = await withTimeout(resolveLinkFromUrl(link.url));
      const title = enrichedTitle(link.title, link.url, resolved.title);
      // The link can wait a while for its turn, and the user may edit it
      // meanwhile: description and thumbnail are only filled in where still
      // empty, and the title only replaced if it's still the one claimed.
      // updateMany by id: a link deleted meanwhile is a no-op, not an error.
      // Also by URL: if the user pointed the link somewhere else while the
      // old page was being looked up, none of the old page's details apply.
      const where = { id: link.id, url: link.url };
      await prisma.$transaction([
        prisma.link.updateMany({
          where,
          data: {
            favicon: resolved.favicon,
            domain: resolved.domain,
            contentType: resolved.contentType,
          },
        }),
        prisma.link.updateMany({
          where: { ...where, description: null },
          data: { description: resolved.description },
        }),
        prisma.link.updateMany({
          where: { ...where, thumbnail: null },
          data: { thumbnail: resolved.thumbnail },
        }),
        ...(title === link.title
          ? []
          : [
              prisma.link.updateMany({
                where: { ...where, title: link.title },
                data: { title },
              }),
            ]),
      ]);
      enriched += 1;
      enrichedUsers.add(link.userId);
    } catch (error) {
      failed += 1;
      console.warn(
        `[enrich-links] Lookup failed for link ${link.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  for (const userId of enrichedUsers) broadcastLinksChanged(userId);

  return { claimed: claimedLinks.length, enriched, failed };
}
