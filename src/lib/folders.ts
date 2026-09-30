import "server-only";

import { MAX_FOLDERS } from "@/lib/limits";
import prisma from "@/lib/prisma";

/** Max length (in characters) of a generated slug. */
const MAX_SLUG_LENGTH = 50;

/** Row shape returned for folder listings/mutations, with the derived link count flattened. */
export type FolderSummary = {
  id: string;
  name: string;
  slug: string;
  linkCount: number;
};

/** Thrown when a folder id/slug doesn't resolve to one owned by the given user. Routes map this to 404. */
export class FolderNotFoundError extends Error {
  readonly name = "FolderNotFoundError";
  constructor() {
    super("Folder not found.");
  }
}

/** Thrown when a folder name fails validation or collides with an existing folder (case-insensitive). */
export class FolderNameError extends Error {
  readonly name = "FolderNameError";
  readonly reason: "empty" | "too_long" | "taken";
  constructor(reason: "empty" | "too_long" | "taken", message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Thrown when a user is at the folder cap. */
export class FolderLimitError extends Error {
  readonly name = "FolderLimitError";
  /** Stable code returned to API clients alongside `LIMIT_REACHED`. */
  readonly feature = "FOLDER_LIMIT";
}

type FolderRowWithCount = {
  id: string;
  name: string;
  slug: string;
  _count: { links: number };
};

function toSummary(row: FolderRowWithCount): FolderSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    linkCount: row._count.links,
  };
}

/**
 * Slugifies a folder name: lowercase, accents stripped, runs of non-`[a-z0-9]`
 * collapsed to `-`, trimmed of leading/trailing `-`, capped at 50 characters.
 * Falls back to `"folder"` when nothing alphanumeric survives.
 */
export function slugifyFolderName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = base || "folder";
  return slug.length > MAX_SLUG_LENGTH ? slug.slice(0, MAX_SLUG_LENGTH) : slug;
}

/** Validates and trims a folder name, throwing `FolderNameError` for empty or over-long input. */
function validateFolderName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new FolderNameError("empty", "Give your folder a name.");
  }
  if (trimmed.length > 60) {
    throw new FolderNameError("too_long", "Keep it under 60 characters.");
  }
  return trimmed;
}

/** Throws `FolderNameError("taken")` if another folder of this user already has this name, case-insensitively. */
async function assertNameAvailable(
  userId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.folder.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) {
    throw new FolderNameError(
      "taken",
      "You already have a folder with that name.",
    );
  }
}

/** Appends `-n` to `base`, trimming `base` first so the result never exceeds 50 characters. */
function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const trimmedBase =
    base.length + suffix.length > MAX_SLUG_LENGTH
      ? base.slice(0, MAX_SLUG_LENGTH - suffix.length)
      : base;
  return `${trimmedBase}${suffix}`;
}

/** Generates a slug for `name` that's unique among the user's other folders, de-colliding with `-2`, `-3`, ... */
async function generateUniqueSlug(
  userId: string,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyFolderName(name);
  const existing = await prisma.folder.findMany({
    where: {
      userId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { slug: true },
  });
  const taken = new Set(existing.map((f) => f.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  let candidate = withSuffix(base, n);
  while (taken.has(candidate)) {
    n += 1;
    candidate = withSuffix(base, n);
  }
  return candidate;
}

/** True when `error` is a Prisma unique-constraint violation (P2002). Checked structurally, matching `username-store.ts`. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Throws `FolderNotFoundError` unless `folderId` belongs to `userId`. */
export async function assertFolderOwned(
  userId: string,
  folderId: string,
): Promise<void> {
  const existing = await prisma.folder.findFirst({
    where: { id: folderId, userId },
  });
  if (!existing) {
    throw new FolderNotFoundError();
  }
}

/** Lists the user's folders with their link counts, ordered by name (case-insensitive). */
export async function listFoldersForUser(
  userId: string,
): Promise<FolderSummary[]> {
  const rows = await prisma.folder.findMany({
    where: { userId },
    include: { _count: { select: { links: true } } },
  });
  return (rows as FolderRowWithCount[])
    .map(toSummary)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Fetches a folder by slug if owned by `userId`; otherwise null. */
export async function getFolderBySlug(
  userId: string,
  slug: string,
): Promise<FolderSummary | null> {
  const row = await prisma.folder.findFirst({
    where: { userId, slug },
    include: { _count: { select: { links: true } } },
  });
  return row ? toSummary(row as FolderRowWithCount) : null;
}

/** Creates a folder for `userId`, enforcing the name rules, the folder cap, and slug uniqueness. */
export async function createFolder(
  userId: string,
  name: string,
): Promise<FolderSummary> {
  const trimmed = validateFolderName(name);

  const count = await prisma.folder.count({ where: { userId } });
  if (count >= MAX_FOLDERS) {
    throw new FolderLimitError(
      `You can have up to ${MAX_FOLDERS} folders.`,
    );
  }

  await assertNameAvailable(userId, trimmed);
  const slug = await generateUniqueSlug(userId, trimmed);

  try {
    const created = await prisma.folder.create({
      data: { userId, name: trimmed, slug },
      include: { _count: { select: { links: true } } },
    });
    return toSummary(created as FolderRowWithCount);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new FolderNameError(
        "taken",
        "You already have a folder with that name.",
      );
    }
    throw error;
  }
}

/** Renames a folder owned by `userId`, regenerating and de-colliding its slug. */
export async function renameFolder(
  userId: string,
  id: string,
  name: string,
): Promise<FolderSummary> {
  await assertFolderOwned(userId, id);
  const trimmed = validateFolderName(name);

  await assertNameAvailable(userId, trimmed, id);
  const slug = await generateUniqueSlug(userId, trimmed, id);

  try {
    const updated = await prisma.folder.update({
      where: { id },
      data: { name: trimmed, slug },
      include: { _count: { select: { links: true } } },
    });
    return toSummary(updated as FolderRowWithCount);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new FolderNameError(
        "taken",
        "You already have a folder with that name.",
      );
    }
    throw error;
  }
}

/** Deletes a folder owned by `userId`. With `withLinks`, its links are deleted too (in the same transaction); otherwise they're kept (and un-foldered via the DB's `SetNull`). */
export async function deleteFolder(
  userId: string,
  id: string,
  opts: { withLinks: boolean },
): Promise<{ deletedLinks: number }> {
  await assertFolderOwned(userId, id);

  if (!opts.withLinks) {
    await prisma.folder.delete({ where: { id } });
    return { deletedLinks: 0 };
  }

  const [deleteManyResult] = await prisma.$transaction([
    prisma.link.deleteMany({ where: { userId, folderId: id } }),
    prisma.folder.delete({ where: { id } }),
  ]);
  return { deletedLinks: deleteManyResult.count };
}
