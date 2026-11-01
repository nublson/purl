import "server-only";

import {
  MAX_LINK_SEARCH_QUERY_LENGTH,
  READER_ABORT_GRACE_MS,
  READER_BATCH_SIZE,
  READER_CONCURRENCY,
  READER_FETCH_TIMEOUT_MS,
  READER_HTML_MAX_BYTES,
  READER_MARKDOWN_MAX_BYTES,
  READER_PENDING_RETRY_MS,
} from "@/lib/limits";
import prisma from "@/lib/prisma";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import {
  cutMarkdown,
  extractArticle,
  extractReaderMarkdown,
} from "@/lib/reader-markdown";
import {
  limitReadableStreamByBytes,
  safeFetch,
  UnsafeOutboundUrlError,
} from "@/lib/safe-outbound-fetch";
import { runPool, settledOrAfter } from "@/lib/task-pool";

export type ReaderRunResult = {
  claimed: number;
  ready: number;
  none: number;
  failed: number;
};

export type ReaderOutcome =
  | { status: "READY"; markdown: string; truncated: boolean; bytes: number }
  | { status: "NONE" | "FAILED"; reason: string };

type Claimed = { linkId: string; userId: string; url: string; claimedAt: Date };

const TOO_LARGE: ReaderOutcome = { status: "FAILED", reason: "too_large" };

function isTooLarge(error: unknown): boolean {
  return (
    error instanceof UnsafeOutboundUrlError &&
    error.message === "Response exceeds maximum size"
  );
}

/** Fetches a page and extracts its article as Markdown. No database access. */
export async function makeReaderView(
  url: string,
  signal: AbortSignal,
): Promise<ReaderOutcome> {
  let res: Response;
  try {
    res = await safeFetch(url, {
      signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
      maxResponseBytes: READER_HTML_MAX_BYTES,
    });
  } catch (error) {
    if (isTooLarge(error)) return TOO_LARGE;
    return { status: "FAILED", reason: "unreachable" };
  }
  if (!res.ok) return { status: "FAILED", reason: "unreachable" };

  const type = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
    void res.body?.cancel().catch(() => {});
    return { status: "NONE", reason: "not_html" };
  }

  let html: string;
  try {
    if (!res.body) return { status: "FAILED", reason: "unreachable" };
    html = await new Response(
      limitReadableStreamByBytes(res.body, READER_HTML_MAX_BYTES),
    ).text();
  } catch (error) {
    if (isTooLarge(error)) return TOO_LARGE;
    return { status: "FAILED", reason: "unreachable" };
  }

  const baseUrl = res.url || url;
  try {
    const article = extractArticle(html, baseUrl);
    if (!article) return { status: "NONE", reason: "no_article" };
    const markdown = extractReaderMarkdown(article.content, baseUrl);
    if (!markdown) return { status: "NONE", reason: "no_article" };
    const cut = cutMarkdown(markdown, READER_MARKDOWN_MAX_BYTES);
    return {
      status: "READY",
      markdown: cut.markdown,
      truncated: cut.truncated,
      bytes: cut.bytes,
    };
  } catch {
    // Markup the extractor can't handle: a page with no article, not a retry.
    return { status: "NONE", reason: "no_article" };
  }
}

/**
 * Looks one page up with an overall timeout. The fetch is aborted on timeout
 * and the pool slot waits for it to unwind for at most the grace period; a
 * timed-out page is always FAILED/timeout.
 */
async function lookUp(url: string): Promise<ReaderOutcome> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = makeReaderView(url, controller.signal);
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve("timeout");
    }, READER_FETCH_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([work, timeout]);
    if (!timedOut && result !== "timeout") return result;
  } finally {
    clearTimeout(timer);
  }
  await settledOrAfter(work, READER_ABORT_GRACE_MS);
  return { status: "FAILED", reason: "timeout" };
}

async function claimNew(limit: number): Promise<Claimed[]> {
  return prisma.$queryRaw<Claimed[]>`
    WITH claimed AS (
      INSERT INTO "reader_views" ("linkId", "userId", "status", "claimedAt")
      SELECT l."id", l."userId", 'PENDING'::"ReaderViewStatus", now() FROM "links" l
      WHERE l."contentType" = 'WEB' AND l."fileKey" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "reader_views" r WHERE r."linkId" = l."id")
      ORDER BY l."createdAt" DESC LIMIT ${limit}
      FOR UPDATE OF l SKIP LOCKED
      ON CONFLICT ("linkId") DO NOTHING
      RETURNING "linkId", "userId", "claimedAt"
    )
    SELECT c."linkId", c."userId", c."claimedAt", l."url"
    FROM claimed c JOIN "links" l ON l."id" = c."linkId"`;
}

async function claimStale(limit: number): Promise<Claimed[]> {
  const retrySecs = READER_PENDING_RETRY_MS / 1000;
  return prisma.$queryRaw<Claimed[]>`
    WITH claimed AS (
      UPDATE "reader_views" SET "claimedAt" = now(), "attempts" = "attempts" + 1
      WHERE "linkId" IN (
        SELECT "linkId" FROM "reader_views"
        WHERE "status" = 'PENDING'::"ReaderViewStatus" AND "attempts" < 2
          AND "claimedAt" < now() - make_interval(secs => ${retrySecs})
        ORDER BY "claimedAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING "linkId", "userId", "claimedAt"
    )
    SELECT c."linkId", c."userId", c."claimedAt", l."url"
    FROM claimed c JOIN "links" l ON l."id" = c."linkId"`;
}

/** Rows whose second attempt never finished are given up on: FAILED/timeout. */
async function giveUpStale(): Promise<string[]> {
  const retrySecs = READER_PENDING_RETRY_MS / 1000;
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    UPDATE "reader_views"
    SET "status" = 'FAILED'::"ReaderViewStatus", "reason" = 'timeout', "fetchedAt" = now()
    WHERE "status" = 'PENDING'::"ReaderViewStatus" AND "attempts" >= 2
      AND "claimedAt" < now() - make_interval(secs => ${retrySecs})
    RETURNING "userId"`;
  return rows.map((r) => r.userId);
}

/**
 * Makes reader views for saved pages that have none, and retries rows stuck
 * PENDING. A result is written only while the row still carries the claim
 * that fetched it, so a row reset meanwhile (URL edit) is never overwritten.
 */
export async function buildPendingReaderViews(): Promise<ReaderRunResult> {
  const result: ReaderRunResult = { claimed: 0, ready: 0, none: 0, failed: 0 };
  let claimed: Claimed[];
  const gaveUp = new Set<string>();
  try {
    for (const userId of await giveUpStale()) gaveUp.add(userId);
    claimed = await claimNew(READER_BATCH_SIZE);
    if (claimed.length < READER_BATCH_SIZE) {
      claimed = [
        ...claimed,
        ...(await claimStale(READER_BATCH_SIZE - claimed.length)),
      ];
    }
  } catch (error) {
    console.error("[reader] run failed", error);
    for (const userId of gaveUp) broadcastLinksChanged(userId);
    return result;
  }
  result.claimed = claimed.length;
  const updatedUsers = new Set<string>(gaveUp);

  await runPool(claimed, READER_CONCURRENCY, async (link) => {
    try {
      const outcome = await lookUp(link.url);
      const data =
        outcome.status === "READY"
          ? {
              status: outcome.status,
              reason: null,
              markdown: outcome.markdown,
              truncated: outcome.truncated,
              bytes: outcome.bytes,
              fetchedAt: new Date(),
            }
          : {
              status: outcome.status,
              reason: outcome.reason,
              markdown: null,
              truncated: false,
              bytes: null,
              fetchedAt: new Date(),
            };
      const { count } = await prisma.readerView.updateMany({
        where: { linkId: link.linkId, claimedAt: link.claimedAt },
        data,
      });
      if (count === 0) return;
      updatedUsers.add(link.userId);
      if (outcome.status === "READY") result.ready += 1;
      else if (outcome.status === "NONE") result.none += 1;
      else result.failed += 1;
    } catch (error) {
      result.failed += 1;
      console.error(`[reader] write failed for link ${link.linkId}`, error);
    }
  });

  for (const userId of updatedUsers) broadcastLinksChanged(userId);
  return result;
}

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
