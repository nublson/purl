import "server-only";

import {
  DEFAULT_FOLDER_EMOJI,
  MAX_FOLDER_DESCRIPTION_LENGTH,
} from "@/lib/folder-display";
import { MAX_FOLDERS } from "@/lib/limits";
import prisma, { type Prisma } from "@/lib/prisma";

/** Either the root client or an interactive-transaction client; the folder helpers below accept both. */
type Db = Prisma.TransactionClient;

/** Max length (in characters) of a generated slug. */
const MAX_SLUG_LENGTH = 50;

// Live in the client-safe module so the folder UI can use them; re-exported here.
export { DEFAULT_FOLDER_EMOJI, MAX_FOLDER_DESCRIPTION_LENGTH };

/**
 * Upper bound (UTF-16 code units) for a stored emoji. The longest real emoji
 * (ZWJ families, subdivision flags) stay well under this; it only stops a
 * single grapheme padded with endless combining marks.
 */
const MAX_EMOJI_LENGTH = 32;

/**
 * Matches a grapheme that renders as an emoji (not a text symbol like © or ™):
 * a code point with default emoji presentation, a pictograph forced to emoji
 * presentation with U+FE0F, a keycap sequence, or a regional-indicator flag.
 */
const EMOJI_PATTERN =
  /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}/u;

/** Row shape returned for folder listings/mutations, with the derived link count flattened. */
export type FolderSummary = {
  id: string;
  name: string;
  slug: string;
  /** The folder's emoji; always set (falls back to `DEFAULT_FOLDER_EMOJI`). */
  emoji: string;
  /** Optional one-line description; `null` when unset. */
  description: string | null;
  /** Readable by anyone at `/@username/slug` (not indexed by search engines). */
  isPublic: boolean;
  /** The user's manual order (ascending; ties break by name). */
  position: number;
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

/** Thrown when a folder emoji isn't exactly one emoji. Routes map this to 400 `INVALID_EMOJI`. */
export class FolderEmojiError extends Error {
  readonly name = "FolderEmojiError";
  constructor() {
    super("Pick a single emoji.");
  }
}

/** Thrown when a folder description is too long. Routes map this to 400 `INVALID_DESCRIPTION`. */
export class FolderDescriptionError extends Error {
  readonly name = "FolderDescriptionError";
  constructor() {
    super(
      `Keep the description to ${MAX_FOLDER_DESCRIPTION_LENGTH} characters or fewer.`,
    );
  }
}

/** Thrown when a user is at the folder cap. */
export class FolderLimitError extends Error {
  readonly name = "FolderLimitError";
  /** Stable code returned to API clients alongside `LIMIT_REACHED`. */
  readonly feature = "FOLDER_LIMIT";
}

/**
 * Thrown when a reorder's ids aren't exactly the user's folders (one missing,
 * extra, repeated, or someone else's). Routes map this to 400 `INVALID_ORDER`.
 */
export class InvalidFolderOrderError extends Error {
  readonly name = "InvalidFolderOrderError";
  constructor() {
    super("The order must list each of your folders exactly once.");
  }
}

type FolderRowWithCount = {
  id: string;
  name: string;
  slug: string;
  emoji?: string | null;
  description?: string | null;
  isPublic?: boolean;
  position?: number;
  _count: { links: number };
};

function toSummary(row: FolderRowWithCount): FolderSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    emoji: row.emoji || DEFAULT_FOLDER_EMOJI,
    description: row.description || null,
    isPublic: row.isPublic ?? false,
    position: row.position ?? 0,
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
  // Slicing can cut right after a separator; trim it so the slug never ends in `-`.
  return slug.length > MAX_SLUG_LENGTH
    ? slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "")
    : slug;
}

/** Validates and trims a folder name, throwing `FolderNameError` for empty or over-long input. */
function validateFolderName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new FolderNameError("empty", "Give your folder a name.");
  }
  if (trimmed.length > 60) {
    throw new FolderNameError("too_long", "Keep the name to 60 characters or fewer.");
  }
  return trimmed;
}

/**
 * Validates an optional folder emoji. Trims it; empty/undefined/null means
 * "no emoji" (`null`, shown as `DEFAULT_FOLDER_EMOJI`). Anything else must be
 * exactly one grapheme that is an emoji, else `FolderEmojiError`.
 */
export function normalizeFolderEmoji(
  emoji: string | null | undefined,
): string | null {
  const trimmed = (emoji ?? "").trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_EMOJI_LENGTH || !EMOJI_PATTERN.test(trimmed)) {
    throw new FolderEmojiError();
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  if (Array.from(segmenter.segment(trimmed)).length !== 1) {
    throw new FolderEmojiError();
  }
  return trimmed;
}

/**
 * Validates an optional folder description. Trims it; empty/undefined/null
 * means no description (`null`). Longer than
 * `MAX_FOLDER_DESCRIPTION_LENGTH` characters → `FolderDescriptionError`.
 */
export function normalizeFolderDescription(
  description: string | null | undefined,
): string | null {
  const trimmed = (description ?? "").trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_FOLDER_DESCRIPTION_LENGTH) {
    throw new FolderDescriptionError();
  }
  return trimmed;
}

/** Throws `FolderNameError("taken")` if another folder of this user already has this name, case-insensitively. */
async function assertNameAvailable(
  userId: string,
  name: string,
  excludeId?: string,
  db: Db = prisma,
): Promise<void> {
  const existing = await db.folder.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) {
    throw new FolderNameError(
      "taken",
      "You already have a folder with that name. Choose another.",
    );
  }
}

/** Appends `-n` to `base`, trimming `base` first so the result never exceeds 50 characters. */
function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const trimmedBase =
    base.length + suffix.length > MAX_SLUG_LENGTH
      ? base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, "")
      : base;
  return `${trimmedBase}${suffix}`;
}

/** Generates a slug for `name` that's unique among the user's other folders, de-colliding with `-2`, `-3`, ... */
async function generateUniqueSlug(
  userId: string,
  name: string,
  excludeId?: string,
  db: Db = prisma,
): Promise<string> {
  const base = slugifyFolderName(name);
  const existing = await db.folder.findMany({
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

/** Lists the user's folders with their link counts, in the user's order (position, then name). */
export async function listFoldersForUser(
  userId: string,
): Promise<FolderSummary[]> {
  const rows = await prisma.folder.findMany({
    where: { userId },
    include: { _count: { select: { links: true } } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return (rows as FolderRowWithCount[]).map(toSummary);
}

/**
 * Sets the user's folder order: `ids` must list every one of their folders
 * exactly once, first to last (positions become 1..n). A stale or partial
 * list throws `InvalidFolderOrderError` and writes nothing. Takes the same
 * per-user lock as `createFolder`, so a folder created meanwhile can't slip
 * between the check and the writes.
 */
export async function reorderFolders(
  userId: string,
  ids: string[],
): Promise<FolderSummary[]> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const owned = await tx.folder.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((folder) => folder.id));
    const unique = new Set(ids);
    if (
      unique.size !== ids.length ||
      ids.length !== ownedIds.size ||
      !ids.every((id) => ownedIds.has(id))
    ) {
      throw new InvalidFolderOrderError();
    }
    for (const [index, id] of ids.entries()) {
      await tx.folder.update({ where: { id }, data: { position: index + 1 } });
    }
  });
  return listFoldersForUser(userId);
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

/**
 * Creates a folder for `userId`, enforcing the name rules, the folder cap, and slug uniqueness.
 *
 * The cap check and the insert run in one interactive transaction that first
 * takes a per-user advisory lock (released at commit/rollback), so concurrent
 * creates for the same user are serialized: two requests at `MAX_FOLDERS - 1`
 * can't both pass the count and overshoot the cap.
 */
export async function createFolder(
  userId: string,
  name: string,
  emoji?: string | null,
  description?: string | null,
): Promise<FolderSummary> {
  const trimmed = validateFolderName(name);
  const normalizedEmoji = normalizeFolderEmoji(emoji);
  const normalizedDescription = normalizeFolderDescription(description);

  try {
    return await prisma.$transaction(async (tx) => {
      // Parameterized tagged template: `userId` is bound, never interpolated
      // into the SQL text. `$executeRaw` (not `$queryRaw`) because the lock
      // function returns `void`, which Prisma can't deserialize as a column.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      const count = await tx.folder.count({ where: { userId } });
      if (count >= MAX_FOLDERS) {
        throw new FolderLimitError(
          `You can have up to ${MAX_FOLDERS} folders.`,
        );
      }

      await assertNameAvailable(userId, trimmed, undefined, tx);
      const slug = await generateUniqueSlug(userId, trimmed, undefined, tx);
      // New folders go last, so the user's order (and digit shortcuts) stay put.
      const { _max } = await tx.folder.aggregate({
        where: { userId },
        _max: { position: true },
      });

      const created = await tx.folder.create({
        data: {
          userId,
          name: trimmed,
          slug,
          emoji: normalizedEmoji,
          description: normalizedDescription,
          position: (_max.position ?? 0) + 1,
        },
        include: { _count: { select: { links: true } } },
      });
      return toSummary(created as FolderRowWithCount);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new FolderNameError(
        "taken",
        "You already have a folder with that name. Choose another.",
      );
    }
    throw error;
  }
}

/** Fields `updateFolder` can change; at least one must be present. */
export type FolderUpdate = {
  name?: string;
  /** A single emoji, or `null`/`""` to clear it back to the default. */
  emoji?: string | null;
  /** Up to 160 characters, or `null`/`""` to clear it. */
  description?: string | null;
  /** Share it at `/@username/slug` (`true`) or make it private again. */
  isPublic?: boolean;
};

/** Thrown when `updateFolder` is called with no fields to change. Routes map this to 400. */
export class FolderUpdateEmptyError extends Error {
  readonly name = "FolderUpdateEmptyError";
  constructor() {
    super("Nothing to update");
  }
}

/**
 * Updates a folder owned by `userId`. A new `name` goes through the same rules
 * as `createFolder` and regenerates (and de-collides) the slug; `emoji` is
 * validated by `normalizeFolderEmoji` and `description` by
 * `normalizeFolderDescription` (`null`/`""` clears either). Omitted fields are
 * left unchanged.
 */
export async function updateFolder(
  userId: string,
  id: string,
  input: FolderUpdate,
): Promise<FolderSummary> {
  const hasName = input.name !== undefined;
  const hasEmoji = input.emoji !== undefined;
  const hasDescription = input.description !== undefined;
  const hasIsPublic = input.isPublic !== undefined;
  if (!hasName && !hasEmoji && !hasDescription && !hasIsPublic) {
    throw new FolderUpdateEmptyError();
  }

  const existing = await prisma.folder.findFirst({
    where: { id, userId },
    select: { slug: true },
  });
  if (!existing) {
    throw new FolderNotFoundError();
  }

  const data: {
    name?: string;
    slug?: string;
    emoji?: string | null;
    description?: string | null;
    isPublic?: boolean;
  } = {};
  if (hasIsPublic) {
    data.isPublic = input.isPublic;
  }
  if (hasEmoji) {
    data.emoji = normalizeFolderEmoji(input.emoji);
  }
  if (hasDescription) {
    data.description = normalizeFolderDescription(input.description);
  }
  if (hasName) {
    const trimmed = validateFolderName(input.name as string);
    await assertNameAvailable(userId, trimmed, id);
    data.name = trimmed;
    data.slug = await generateUniqueSlug(userId, trimmed, id);
  }

  const slugChanged = data.slug !== undefined && data.slug !== existing.slug;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.folder.update({
        where: { id },
        data,
        include: { _count: { select: { links: true } } },
      });
      if (slugChanged) {
        // The old slug keeps working for shared links: it redirects to the
        // new one (a folder that later takes that slug wins over it).
        await tx.folderSlugRedirect.upsert({
          where: { userId_slug: { userId, slug: existing.slug } },
          create: { userId, slug: existing.slug, folderId: id },
          update: { folderId: id },
        });
      }
      return row;
    });
    return toSummary(updated as FolderRowWithCount);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new FolderNameError(
        "taken",
        "You already have a folder with that name. Choose another.",
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
