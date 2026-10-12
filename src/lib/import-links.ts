import "server-only";

import { suggestFolderEmoji } from "@/lib/emoji-suggestion";
import { createFolderInTx, FolderLimitError, FolderNameError } from "@/lib/folders";
import { guessContentType } from "@/lib/guess-content-type";
import { truncateFolderName } from "@/lib/import/normalize";
import type { ImportLinkInput, ImportLinksResult } from "@/lib/import/types";
import { MAX_FOLDERS, MAX_FOLDER_NAME_LENGTH, MAX_SAVED_LINKS } from "@/lib/limits";
import { linkUrlKey } from "@/lib/link-url-key";
import prisma, { type Prisma } from "@/lib/prisma";
import { getDefaultFaviconUrl } from "@/utils/default-favicon";
import { getUrlDomain } from "@/utils/formatter";

const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 500;
const EARLIEST_DATE = new Date("2000-01-01T00:00:00Z");
/**
 * Prisma's interactive-transaction defaults (5 s, 2 s to start) are too short
 * for a chunk that creates many folders one by one (several round trips
 * each): such a chunk would roll back on every attempt. The function's
 * default duration on Vercel is well above 30 s.
 */
const IMPORT_TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

/** Postgres `text` rejects NUL, which would fail the whole chunk's insert. */
const stripNul = (text: string) => text.replaceAll("\u0000", "");

type ValidLink = {
  url: string;
  title: string;
  createdAt: Date;
  folder: string | null;
};

function validUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH || url.includes("\u0000")) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
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

function validTitle(raw: unknown, url: string): string {
  const title = typeof raw === "string" ? cutAt(stripNul(raw).trim(), MAX_TITLE_LENGTH).trim() : "";
  return title.length > 0 ? title : getUrlDomain(url);
}

function validDate(raw: unknown, now: Date): Date {
  if (typeof raw !== "string") return now;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || date < EARLIEST_DATE || date > now) return now;
  return date;
}

function validFolder(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = stripNul(raw).trim();
  if (name.length === 0) return null;
  // Shortened here so `createFolderInTx` never rejects it as too long.
  return name.length > MAX_FOLDER_NAME_LENGTH ? truncateFolderName(name) : name;
}

function validate(input: ImportLinkInput, now: Date): ValidLink | null {
  const url = validUrl(input?.url);
  if (!url) return null;
  return {
    url,
    title: validTitle(input.title, url),
    createdAt: validDate(input.createdAt, now),
    folder: validFolder(input.folder),
  };
}

const folderKey = (name: string) => name.trim().toLowerCase();

/**
 * Saves one chunk of imported links for `userId` without fetching anything:
 * each link is stored as given, flagged `needsMetadata` for the background
 * top-up. Runs in one transaction holding the folder lock, then the links
 * lock (always that order; nothing else takes both), so the save cap and the
 * folder cap hold against concurrent saves. Never throws for bad input:
 * invalid links, duplicates and links over the cap are counted instead.
 */
export async function importLinksForUser(
  userId: string,
  inputs: ImportLinkInput[],
  now: Date = new Date(),
): Promise<ImportLinksResult> {
  let invalid = 0;
  const valid: ValidLink[] = [];
  for (const input of inputs) {
    const link = validate(input, now);
    if (link) valid.push(link);
    else invalid++;
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`links:${userId}`}))`;

    const count = await tx.link.count({ where: { userId } });
    const existing = await tx.link.findMany({
      where: { userId },
      select: { url: true },
    });

    const seen = new Set(existing.map((link) => linkUrlKey(link.url)));
    let duplicates = 0;
    const unique: ValidLink[] = [];
    for (const link of valid) {
      const key = linkUrlKey(link.url);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      unique.push(link);
    }

    const remaining = Math.max(0, MAX_SAVED_LINKS - count);
    const accepted = unique.slice(0, remaining);
    const overLimit = unique.length - accepted.length;

    const result: ImportLinksResult = {
      imported: 0,
      duplicates,
      invalid,
      overLimit,
      foldersCreated: 0,
      unfiledForFolderLimit: 0,
      limitReached: overLimit > 0,
    };
    if (accepted.length === 0) return result;

    const folderIds = await resolveFolders(tx, userId, accepted, result);

    const data = accepted.map((link) => {
      const domain = getUrlDomain(link.url);
      const folderId = link.folder ? (folderIds.get(folderKey(link.folder)) ?? null) : null;
      if (link.folder && !folderId) result.unfiledForFolderLimit++;
      return {
        url: link.url,
        title: link.title,
        domain,
        favicon: getDefaultFaviconUrl(domain),
        description: null,
        thumbnail: null,
        contentType: guessContentType(link.url),
        createdAt: link.createdAt,
        folderId,
        userId,
        needsMetadata: true,
      };
    });

    const { count: inserted } = await tx.link.createMany({ data });
    result.imported = inserted;
    return result;
  }, IMPORT_TRANSACTION_OPTIONS);
}

/**
 * Maps each wanted folder (by `folderKey`) to an id: an existing folder with
 * that name ignoring case and surrounding spaces, else a new one while the
 * account is under `MAX_FOLDERS`. Names left out of the map are written
 * unfiled. The caller holds the folder lock on `tx`.
 */
async function resolveFolders(
  tx: Prisma.TransactionClient,
  userId: string,
  links: ValidLink[],
  result: ImportLinksResult,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (!links.some((link) => link.folder)) return ids;

  const folders = await tx.folder.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  for (const folder of folders) {
    const key = folderKey(folder.name);
    if (!ids.has(key)) ids.set(key, folder.id);
  }

  let folderCount = folders.length;
  const unavailable = new Set<string>();
  for (const { folder: name } of links) {
    if (!name) continue;
    const key = folderKey(name);
    if (ids.has(key) || unavailable.has(key)) continue;
    if (folderCount >= MAX_FOLDERS) {
      unavailable.add(key);
      continue;
    }
    const id = await createOrFindFolder(tx, userId, name);
    if (id === null) {
      unavailable.add(key);
    } else if (id.created) {
      ids.set(key, id.id);
      folderCount++;
      result.foldersCreated++;
    } else {
      ids.set(key, id.id);
    }
  }
  return ids;
}

/**
 * Creates `name`, or, when the database already has it under a name the JS
 * match missed (Postgres's case-insensitive compare differs from
 * `toLowerCase` for some characters), uses that one. `null` when it can't be
 * created: its links go in unfiled. These errors are thrown in JS after
 * plain reads, so the transaction is still usable.
 */
async function createOrFindFolder(
  tx: Prisma.TransactionClient,
  userId: string,
  name: string,
): Promise<{ id: string; created: boolean } | null> {
  try {
    const created = await createFolderInTx(tx, userId, name, suggestFolderEmoji(name));
    return { id: created.id, created: true };
  } catch (error) {
    if (error instanceof FolderNameError && error.reason === "taken") {
      const existing = await tx.folder.findFirst({
        where: { userId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      return existing ? { id: existing.id, created: false } : null;
    }
    if (error instanceof FolderLimitError) return null;
    throw error;
  }
}
