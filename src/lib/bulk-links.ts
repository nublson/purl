import { MAX_BULK_LINK_IDS } from "@/lib/limits";

/** Response of a bulk move (`PATCH /api/links/bulk`, v1, MCP `move_links`). */
export type MoveLinksResult = {
  /** The moved links with the folder each was in before (`null` = none), so the move can be undone. */
  moved: { id: string; previousFolderId: string | null }[];
  /** Requested ids that don't exist or belong to someone else (nothing written for them). */
  notFound: string[];
};

/**
 * Groups moved links by the folder they came from, to undo a bulk move with
 * one request per source folder. `null` = links that were in no folder.
 */
export function groupByPreviousFolder(
  moved: MoveLinksResult["moved"],
): Map<string | null, string[]> {
  const groups = new Map<string | null, string[]>();
  for (const { id, previousFolderId } of moved) {
    const ids = groups.get(previousFolderId);
    if (ids) ids.push(id);
    else groups.set(previousFolderId, [id]);
  }
  return groups;
}

/** A bulk request body that failed validation: a 400 with this `error` and `code`. */
export type BulkBodyError = {
  ok: false;
  error: string;
  code: "INVALID_IDS" | "TOO_MANY_IDS" | "INVALID_FOLDER" | "INVALID_READ";
};

/**
 * Validates `ids` for a bulk move/delete: a non-empty array of non-empty
 * strings, at most `MAX_BULK_LINK_IDS`. Duplicates are dropped (first
 * occurrence kept), so the cap applies to distinct ids.
 */
export function parseLinkIds(
  value: unknown,
): { ok: true; ids: string[] } | BulkBodyError {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((id) => typeof id === "string" && id.length > 0)
  ) {
    return {
      ok: false,
      error: "ids must be a non-empty array of link ids",
      code: "INVALID_IDS",
    };
  }
  const ids = Array.from(new Set(value as string[]));
  if (ids.length > MAX_BULK_LINK_IDS) {
    return {
      ok: false,
      error: `At most ${MAX_BULK_LINK_IDS} links at a time`,
      code: "TOO_MANY_IDS",
    };
  }
  return { ok: true, ids };
}

/**
 * Body of a bulk move: `{ ids, folderId }`. `folderId` is required: a folder
 * id files the links there, `null` takes them out of their folders.
 */
export function parseBulkMoveBody(
  body: unknown,
): { ok: true; ids: string[]; folderId: string | null } | BulkBodyError {
  const record = body !== null && typeof body === "object" ? body : {};
  const ids = parseLinkIds((record as { ids?: unknown }).ids);
  if (!ids.ok) return ids;
  const folderId = (record as { folderId?: unknown }).folderId;
  if (
    !("folderId" in record) ||
    (folderId !== null && (typeof folderId !== "string" || folderId === ""))
  ) {
    return {
      ok: false,
      error: "folderId must be a folder id, or null to remove the links from their folders",
      code: "INVALID_FOLDER",
    };
  }
  return { ok: true, ids: ids.ids, folderId: folderId as string | null };
}

/** Body of a bulk delete: `{ ids }`. */
export function parseBulkDeleteBody(
  body: unknown,
): { ok: true; ids: string[] } | BulkBodyError {
  const record = body !== null && typeof body === "object" ? body : {};
  return parseLinkIds((record as { ids?: unknown }).ids);
}

/** Whether a bulk `PATCH` body marks links read/unread (`read`) rather than moving them. */
export function isBulkReadBody(body: unknown): boolean {
  return body !== null && typeof body === "object" && "read" in body;
}

/**
 * Body of a bulk read change: `{ ids, read }`. `read: true` marks the links
 * read, `false` unread. A body can't also move the links (`folderId`).
 */
export function parseBulkReadBody(
  body: unknown,
): { ok: true; ids: string[]; read: boolean } | BulkBodyError {
  const record = body !== null && typeof body === "object" ? body : {};
  const ids = parseLinkIds((record as { ids?: unknown }).ids);
  if (!ids.ok) return ids;
  const read = (record as { read?: unknown }).read;
  if (typeof read !== "boolean" || "folderId" in record) {
    return {
      ok: false,
      error: "read must be true or false, and can't be combined with folderId",
      code: "INVALID_READ",
    };
  }
  return { ok: true, ids: ids.ids, read };
}
