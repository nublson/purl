import {
  FolderDescriptionError,
  FolderEmojiError,
  FolderLimitError,
  FolderNameError,
  FolderNotFoundError,
  FolderUpdateEmptyError,
} from "@/lib/folders";
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
 * Maps the folder library's errors (`FolderNameError`, `FolderEmojiError`,
 * `FolderDescriptionError`, `FolderUpdateEmptyError`, `FolderLimitError`, `FolderNotFoundError`) to the shared API response shape used by both the
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
  if (e instanceof FolderEmojiError) {
    return NextResponse.json(
      { error: e.message, code: "INVALID_EMOJI" },
      { status: 400 },
    );
  }
  if (e instanceof FolderDescriptionError) {
    return NextResponse.json(
      { error: e.message, code: "INVALID_DESCRIPTION" },
      { status: 400 },
    );
  }
  if (e instanceof FolderUpdateEmptyError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
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

/**
 * Reads the optional `emoji` field of a folder request body: absent →
 * `undefined` (leave unchanged / no emoji), `null` or a string → passed on to
 * the library for validation, anything else → a 400 `INVALID_EMOJI` response.
 */
export function parseEmojiField(
  value: unknown,
): string | null | undefined | NextResponse {
  if (value === undefined || value === null || typeof value === "string") {
    return value;
  }
  return NextResponse.json(
    { error: new FolderEmojiError().message, code: "INVALID_EMOJI" },
    { status: 400 },
  );
}

/**
 * Reads the optional `description` field of a folder request body: absent →
 * `undefined` (leave unchanged / none), `null` or a string → passed on to the
 * library for validation, anything else → a 400 `INVALID_DESCRIPTION` response.
 */
export function parseDescriptionField(
  value: unknown,
): string | null | undefined | NextResponse {
  if (value === undefined || value === null || typeof value === "string") {
    return value;
  }
  return NextResponse.json(
    { error: "The description must be text.", code: "INVALID_DESCRIPTION" },
    { status: 400 },
  );
}

/**
 * Reads the optional `isPublic` field of a folder update: absent →
 * `undefined` (unchanged), a boolean → passed on, anything else → a 400
 * `INVALID_PUBLIC` response.
 */
export function parseIsPublicField(
  value: unknown,
): boolean | undefined | NextResponse {
  if (value === undefined || typeof value === "boolean") return value;
  return NextResponse.json(
    { error: "isPublic must be true or false", code: "INVALID_PUBLIC" },
    { status: 400 },
  );
}
