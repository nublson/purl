import "server-only";

import { del, list } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { uploadsEnabled } from "@/lib/uploads";

/** At most this many blobs are deleted per run; the next run picks up the rest. */
export const SWEEP_BUDGET = 500;

/**
 * A blob younger than this is left alone: its row may still be on its way
 * (the browser uploads first, then asks for the row).
 */
export const SWEEP_MIN_AGE_MS = 60 * 60 * 1000;

/** Blob's `list` page size (its maximum). */
const LIST_PAGE_SIZE = 1000;

export type SweepResult = {
  /** Every blob seen under `users/`, old or not. */
  listed: number;
  deleted: number;
  /** The budget ran out before the store did. */
  stopped: boolean;
};

/**
 * Deletes uploaded blobs no row references (by `url` or `thumbnail`) once
 * they're older than `SWEEP_MIN_AGE_MS`: a tab closed between the upload and
 * its row, a delete whose `del` failed, a retry that made a new preview.
 * Pages through `users/`, one lookup and one `del` per page, never deleting
 * more than `budget`. A failed `del` is logged and the run goes on; a failed
 * `list` (or lookup) ends it with what was counted. Never throws.
 */
export async function sweepOrphanUploads({
  now = new Date(),
  budget = SWEEP_BUDGET,
}: { now?: Date; budget?: number } = {}): Promise<SweepResult> {
  const result: SweepResult = { listed: 0, deleted: 0, stopped: false };
  if (!uploadsEnabled()) return result;

  const cutoff = now.getTime() - SWEEP_MIN_AGE_MS;
  try {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: "users/", cursor, limit: LIST_PAGE_SIZE });
      result.listed += page.blobs.length;

      const urls = page.blobs
        .filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff)
        .map((blob) => blob.url);
      if (urls.length > 0) {
        const referenced = new Set<string>();
        const rows = await prisma.link.findMany({
          where: { OR: [{ url: { in: urls } }, { thumbnail: { in: urls } }] },
          select: { url: true, thumbnail: true },
        });
        for (const row of rows) {
          referenced.add(row.url);
          if (row.thumbnail) referenced.add(row.thumbnail);
        }
        const orphans = urls
          .filter((url) => !referenced.has(url))
          .slice(0, budget - result.deleted);
        if (orphans.length > 0) {
          try {
            await del(orphans);
            result.deleted += orphans.length;
          } catch (error) {
            console.error("[uploads] del failed", error);
          }
        }
      }

      if (result.deleted >= budget) {
        result.stopped = true;
        break;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error("[uploads] sweep failed", error);
  }
  return result;
}
