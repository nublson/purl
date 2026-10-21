import { MAX_FOLDERS, MAX_SAVED_LINKS } from "@/lib/limits";
import type { ImportFormat, ImportLinksResult } from "./types";

const FORMAT_LABELS: Record<ImportFormat, string> = {
  "bookmarks-html": "Browser bookmarks",
  "raindrop-csv": "Raindrop CSV",
  "pocket-csv": "Pocket CSV",
};

const format = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function previewSummary(
  parsed: {
    format: ImportFormat;
    itemCount: number;
    folders: { name: string; count: number }[];
    skipped: number;
  },
  room: number,
  existingFolderNames: string[],
): { heading: string; lines: string[] } {
  const { itemCount, folders, skipped } = parsed;
  const links = `${format(itemCount)} ${plural(itemCount, "link", "links")}`;
  const heading =
    folders.length === 0
      ? links
      : `${links} in ${format(folders.length)} ${plural(folders.length, "folder", "folders")}`;

  const lines = [FORMAT_LABELS[parsed.format]];

  // Only an estimate when the file is bigger than the room: the server skips
  // links already saved before it applies the cap, newest first.
  if (itemCount <= room) {
    lines.push(`All ${format(itemCount)} fit.`);
  } else if (room <= 0) {
    lines.push(
      `You’ve reached your ${format(MAX_SAVED_LINKS)}-link limit, so new links can’t be imported.`,
    );
  } else {
    lines.push(
      `You have room for ${format(room)} more ${plural(room, "link", "links")}. The newest are imported first, and links you already have don’t count.`,
    );
  }

  if (folders.length === 0) {
    lines.push("This file has no folder information, so links go to Home.");
  }

  if (skipped > 0) {
    lines.push(
      skipped === 1
        ? "1 item isn’t a web link and will be skipped."
        : `${format(skipped)} items aren’t web links and will be skipped.`,
    );
  }

  const existing = new Set(existingFolderNames.map((name) => name.toLowerCase()));
  const newNames = new Set(
    folders
      .map((folder) => folder.name.toLowerCase())
      .filter((name) => !existing.has(name)),
  );
  const folderRoom = Math.max(MAX_FOLDERS - existing.size, 0);
  const overflow = Math.max(newNames.size - folderRoom, 0);
  if (overflow > 0) {
    lines.push(
      `${format(overflow)} ${plural(overflow, "folder", "folders")} won’t fit in your ${MAX_FOLDERS}-folder limit; their links go to Home.`,
    );
  }

  return { heading, lines };
}

export function doneSummary(
  totals: ImportLinksResult,
  skipped: number,
): { title: string; lines: string[] } {
  const { imported, duplicates, invalid, overLimit, foldersCreated, unfiledForFolderLimit } =
    totals;

  const title =
    imported === 0
      ? "Nothing new to import"
      : `Imported ${format(imported)} ${plural(imported, "link", "links")}`;

  const lines: string[] = [];

  if (foldersCreated > 0) {
    lines.push(
      `Created ${format(foldersCreated)} ${plural(foldersCreated, "folder", "folders")}.`,
    );
  }

  if (duplicates > 0) {
    if (imported === 0 && overLimit === 0 && duplicates > 1) {
      lines.push(`All ${format(duplicates)} links were already saved.`);
    } else {
      lines.push(
        duplicates === 1
          ? "1 was already saved and was skipped."
          : `${format(duplicates)} were already saved and were skipped.`,
      );
    }
  }

  const notLinks = invalid + skipped;
  if (notLinks > 0) {
    lines.push(
      notLinks === 1 ? "1 wasn’t a web link." : `${format(notLinks)} weren’t web links.`,
    );
  }

  if (overLimit > 0) {
    lines.push(
      `${format(overLimit)} weren’t imported because you reached your ${format(MAX_SAVED_LINKS)}-link limit.`,
    );
  }

  if (unfiledForFolderLimit > 0) {
    lines.push(
      `${format(unfiledForFolderLimit)} ${plural(unfiledForFolderLimit, "link", "links")} went to Home because you reached your ${MAX_FOLDERS}-folder limit.`,
    );
  }

  if (imported > 0) {
    lines.push("Thumbnails and details fill in over the next few minutes.");
  }

  return { title, lines };
}

/**
 * The done wording for a run that sent `sent` of its `itemCount` links. Links
 * left unsent because the server reported the limit reached count as over
 * the limit; a run that stopped for another reason never gets here.
 */
export function runDoneSummary(
  run: { itemCount: number; sent: number; totals: ImportLinksResult },
  skipped: number,
): { title: string; lines: string[] } {
  const unsent = run.totals.limitReached ? run.itemCount - run.sent : 0;
  return doneSummary(
    { ...run.totals, overLimit: run.totals.overLimit + unsent },
    skipped,
  );
}
