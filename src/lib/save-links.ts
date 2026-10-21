import { formatFolderLabel } from "@/lib/folder-display";
import { MAX_SAVED_LINKS } from "@/lib/limits";
import { saveLink, type SaveLinkFolder } from "@/lib/save-link";

export type BatchOutcome = {
  saved: number;
  failed: number;
  /** Links never tried because the save limit stopped the batch. */
  notAttempted: number;
  limit: boolean;
};

/**
 * Saves `urls` one after another, in order, through `POST /api/links` (so the
 * folder, duplicate and limit rules are the single-save ones). A failed link
 * doesn't stop the rest; the save limit does, since every later link would
 * fail the same way. No toasts: the caller shows `batchSummary` once.
 */
export async function saveLinks(
  urls: string[],
  opts: {
    folder?: SaveLinkFolder;
    /** A link is about to be saved; `progress.index` counts from 1. */
    onStart?: (url: string, progress: { index: number; total: number }) => void;
    /** Awaited, so the page can show the row before the next link starts. */
    onSaved?: (
      id: string,
      progress: { index: number; total: number },
    ) => void | Promise<void>;
    onFailed?: () => void;
  } = {},
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { saved: 0, failed: 0, notAttempted: 0, limit: false };

  for (const [index, url] of urls.entries()) {
    opts.onStart?.(url, { index: index + 1, total: urls.length });
    const result = await saveLink(url, { folder: opts.folder, quiet: true });

    if (result && "id" in result) {
      outcome.saved += 1;
      await opts.onSaved?.(result.id, { index: index + 1, total: urls.length });
      continue;
    }

    outcome.failed += 1;
    opts.onFailed?.();
    if (result && "limit" in result && result.limit) {
      outcome.limit = true;
      outcome.notAttempted = urls.length - index - 1;
      break;
    }
  }

  return outcome;
}

export type BatchSummary = {
  tone: "success" | "warning" | "error";
  message: string;
};

const LIMIT_MESSAGE = `You’ve reached the ${MAX_SAVED_LINKS.toLocaleString("en-US")}-link limit.`;

/** The one toast after a multi-link paste. `skipped` is the paste's non-link text. */
export function batchSummary(
  outcome: BatchOutcome,
  skipped: number,
  folder?: SaveLinkFolder,
): BatchSummary {
  const total = outcome.saved + outcome.failed + outcome.notAttempted;
  const skippedNote =
    skipped === 0
      ? ""
      : skipped === 1
        ? "Skipped 1 piece of text that wasn’t a link."
        : `Skipped ${skipped} pieces of text that weren’t links.`;

  if (outcome.saved === 0) {
    return {
      tone: "error",
      message: outcome.limit ? LIMIT_MESSAGE : "Couldn’t save these links. Try again.",
    };
  }

  if (outcome.failed === 0 && outcome.notAttempted === 0) {
    const where = folder ? ` to ${formatFolderLabel(folder)}` : "";
    const saved = `Saved ${outcome.saved} links${where}`;
    return {
      tone: "success",
      message: skippedNote ? `${saved}. ${skippedNote}` : saved,
    };
  }

  const why = outcome.limit ? LIMIT_MESSAGE : `${outcome.failed} couldn’t be saved.`;
  return {
    tone: "warning",
    message: [`Saved ${outcome.saved} of ${total} links.`, why, skippedNote]
      .filter(Boolean)
      .join(" "),
  };
}
