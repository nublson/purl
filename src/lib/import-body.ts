import { MAX_IMPORT_CHUNK } from "@/lib/limits";
import type { ImportLinkInput } from "@/lib/import/types";

/** An import request body that failed validation: a 400 with this `error` and `code`. */
export type ImportBodyError = {
  ok: false;
  error: string;
  code: "INVALID_BODY" | "TOO_MANY";
};

function invalid(): ImportBodyError {
  return {
    ok: false,
    error: "links must be a non-empty array of { url, title, folder, createdAt }",
    code: "INVALID_BODY",
  };
}

/**
 * Validates the shape of `POST /api/links/import`: `{ links }`, a non-empty
 * array of at most `MAX_IMPORT_CHUNK` objects with a string `url`. Only the
 * shape is checked here; the import service validates URLs, titles, folders
 * and dates itself and counts what it skips.
 */
export function parseImportBody(
  body: unknown,
): { ok: true; links: ImportLinkInput[] } | ImportBodyError {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalid();
  }
  const raw = (body as { links?: unknown }).links;
  if (!Array.isArray(raw) || raw.length === 0) return invalid();
  if (raw.length > MAX_IMPORT_CHUNK) {
    return {
      ok: false,
      error: `At most ${MAX_IMPORT_CHUNK} links at a time`,
      code: "TOO_MANY",
    };
  }

  const links: ImportLinkInput[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return invalid();
    const { url, title, folder, createdAt } = item as Record<string, unknown>;
    if (typeof url !== "string") return invalid();
    links.push({
      url,
      title: typeof title === "string" ? title : "",
      folder: typeof folder === "string" ? folder : null,
      createdAt: typeof createdAt === "string" ? createdAt : null,
    });
  }
  return { ok: true, links };
}
