import { linksOriginHeaders } from "@/lib/links-origin";
import { MAX_IMPORT_CHUNK } from "@/lib/limits";
import type { ImportItem, ImportLinkInput, ImportLinksResult } from "./types";

export type RunImportOutcome = {
  totals: ImportLinksResult;
  stopped: "done" | "limit" | "aborted" | "error";
  error?: { status?: number; message: string };
};

const RATE_LIMIT_MESSAGE = "Too many requests. Wait a minute and try again.";
const NETWORK_MESSAGE = "Couldn’t reach Purl. Check your connection and try again.";
const GENERIC_MESSAGE = "Something went wrong. Try again.";
/** The server cuts titles at this length too; cut here so less is sent. */
const MAX_TITLE_LENGTH = 500;

function emptyTotals(): ImportLinksResult {
  return {
    imported: 0,
    duplicates: 0,
    invalid: 0,
    overLimit: 0,
    foldersCreated: 0,
    unfiledForFolderLimit: 0,
    limitReached: false,
  };
}

/** Cuts at `max` UTF-16 units without splitting a surrogate pair. */
function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const point of text) {
    if (out.length + point.length > max) break;
    out += point;
  }
  return out;
}

function toInput(item: ImportItem): ImportLinkInput {
  return {
    url: item.url,
    title: cutAt(item.title, MAX_TITLE_LENGTH),
    folder: item.folder,
    createdAt: item.createdAt ? item.createdAt.toISOString() : null,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Sends `items` to `POST /api/links/import` in chunks of `MAX_IMPORT_CHUNK`,
 * one after another, adding up each chunk's counts. Stops early when the save
 * limit is reached, the signal aborts, or a request fails; the totals so far
 * are always returned.
 */
export async function runImport(
  items: ImportItem[],
  opts: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RunImportOutcome> {
  const totals = emptyTotals();
  const total = items.length;

  for (let start = 0; start < total; start += MAX_IMPORT_CHUNK) {
    if (opts.signal?.aborted) return { totals, stopped: "aborted" };

    const links = items.slice(start, start + MAX_IMPORT_CHUNK).map(toInput);

    let res: Response;
    try {
      res = await fetch("/api/links/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...linksOriginHeaders },
        body: JSON.stringify({ links }),
        signal: opts.signal,
      });
    } catch (error) {
      if (isAbortError(error)) return { totals, stopped: "aborted" };
      return { totals, stopped: "error", error: { message: NETWORK_MESSAGE } };
    }

    if (!res.ok) {
      if (res.status === 429) {
        return {
          totals,
          stopped: "error",
          error: { status: 429, message: RATE_LIMIT_MESSAGE },
        };
      }
      const data = (await res.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      const message =
        typeof data?.error === "string" && data.error ? data.error : GENERIC_MESSAGE;
      return { totals, stopped: "error", error: { status: res.status, message } };
    }

    let result: ImportLinksResult;
    try {
      result = (await res.json()) as ImportLinksResult;
    } catch (error) {
      if (isAbortError(error)) return { totals, stopped: "aborted" };
      return {
        totals,
        stopped: "error",
        error: { status: res.status, message: GENERIC_MESSAGE },
      };
    }

    totals.imported += result.imported;
    totals.duplicates += result.duplicates;
    totals.invalid += result.invalid;
    totals.overLimit += result.overLimit;
    totals.foldersCreated += result.foldersCreated;
    totals.unfiledForFolderLimit += result.unfiledForFolderLimit;
    totals.limitReached = totals.limitReached || result.limitReached;

    opts.onProgress?.(Math.min(start + links.length, total), total);

    if (result.limitReached) return { totals, stopped: "limit" };
  }

  return { totals, stopped: "done" };
}
