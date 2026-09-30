import { FolderLimitError, FolderNameError, FolderNotFoundError } from "@/lib/folders";
import { NextResponse } from "next/server";

const NAME_ERROR_CODES: Record<FolderNameError["reason"], string> = {
  empty: "NAME_EMPTY",
  too_long: "NAME_TOO_LONG",
  taken: "NAME_TAKEN",
};

const NAME_ERROR_STATUS: Record<FolderNameError["reason"], number> = {
  empty: 400,
  too_long: 400,
  taken: 409,
};

/**
 * Maps the folder library's errors (`FolderNameError`, `FolderLimitError`,
 * `FolderNotFoundError`) to the shared API response shape used by both the
 * browser-session `/api/folders` routes and the API-key `/api/v1/folders`
 * routes. Returns `null` when `e` isn't one of these, so callers can
 * `throw e` unchanged.
 */
export function mapFolderError(e: unknown): NextResponse | null {
  if (e instanceof FolderNameError) {
    return NextResponse.json(
      { error: e.message, code: NAME_ERROR_CODES[e.reason] },
      { status: NAME_ERROR_STATUS[e.reason] },
    );
  }
  if (e instanceof FolderLimitError) {
    return NextResponse.json(
      { error: e.message, code: "LIMIT_REACHED", feature: e.feature },
      { status: 403 },
    );
  }
  if (e instanceof FolderNotFoundError) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  return null;
}
