import "server-only";

import { canEmbed } from "@/lib/embeds";
import { resolveLinkFromUrl, type ResolvedLinkFields } from "@/lib/links";
import prisma from "@/lib/prisma";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { getUrlDomain } from "@/utils/formatter";

/** Links claimed per cron run (one a minute), newest first. */
export const ENRICH_BATCH_SIZE = 20;
/** Metadata lookups running at once. */
export const ENRICH_CONCURRENCY = 5;
/** A lookup that takes longer is aborted and counts as failed. */
export const ENRICH_LINK_TIMEOUT_MS = 20_000;
/**
 * After aborting a lookup, how long its pool slot waits for the cancelled
 * requests to unwind before moving on regardless (a step that ignores the
 * signal must not hold the whole run).
 */
export const ENRICH_ABORT_GRACE_MS = 2_000;

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

/** Resolves when `promise` settles, or after `ms`, whichever comes first. */
async function settledOrAfter(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([promise.then(noop, noop), grace]);
  } finally {
    clearTimeout(timer);
  }
}

function noop(): void {}

/**
 * Looks a link up, giving the whole lookup `ENRICH_LINK_TIMEOUT_MS`. When
 * that runs out the lookup's requests are ABORTED (not just abandoned, which
 * would leave them running beside the next lookups and break the concurrency
 * bound), and the pool slot is only released once they've unwound, or after
 * `ENRICH_ABORT_GRACE_MS` at most. An aborted lookup can still come back with
 * fallback data (the scrapers swallow errors): that is not a result, so a
 * timed-out lookup always counts as failed.
 */
async function lookUp(url: string): Promise<ResolvedLinkFields> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lookup = resolveLinkFromUrl(url, { signal: controller.signal });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new EnrichTimeoutError());
    }, ENRICH_LINK_TIMEOUT_MS);
  });
  try {
    const resolved = await Promise.race([lookup, timeout]);
    if (!timedOut) return resolved;
  } catch (error) {
    if (!timedOut) throw error;
  } finally {
    clearTimeout(timer);
  }
  await settledOrAfter(lookup, ENRICH_ABORT_GRACE_MS);
  throw new EnrichTimeoutError();
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
      const resolved = await lookUp(link.url);
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
            mimeType: resolved.mimeType,
            // A pearl switched live before its lookup (a guessed WEB) that
            // turns out to be a PDF or an image can't stay live: only pages
            // can (`canEmbed`, which the switch checks).
            ...(canEmbed({ contentType: resolved.contentType, upload: false })
              ? {}
              : { embed: false }),
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
