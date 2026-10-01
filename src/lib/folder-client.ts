"use client";

import type { FolderSummary } from "@/lib/folders";
import { linksOriginHeaders } from "@/lib/links-origin";
import type { Link } from "@/utils/links";

/**
 * Result shape for every folder/link-filing action: success carries `data`,
 * failure a user-facing `error` plus the API's machine `code` when it sent
 * one (e.g. `NAME_TAKEN`), so a form can show the error on the right field.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

const FALLBACK_ERROR = "Something went wrong. Try again.";

async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function errorFromBody(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return FALLBACK_ERROR;
}

function codeFromBody(body: unknown): string | undefined {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { code?: unknown }).code === "string"
  ) {
    return (body as { code: string }).code;
  }
  return undefined;
}

/** Runs a mutating fetch and maps it to `ActionResult`, never throwing. */
async function mutate<T>(
  path: string,
  init: RequestInit,
): Promise<ActionResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...linksOriginHeaders,
        ...init.headers,
      },
    });
    const body = await parseBody(res);
    if (!res.ok) {
      const code = codeFromBody(body);
      return {
        ok: false,
        error: errorFromBody(body),
        ...(code ? { code } : {}),
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: FALLBACK_ERROR };
  }
}

/**
 * Fetches the signed-in user's folders. Unlike the mutating helpers below,
 * this throws on a non-2xx response or network error — callers (the
 * `FoldersProvider`) catch it and keep the previous list rather than surface
 * a toast for a background refresh.
 */
export async function fetchFolders(): Promise<FolderSummary[]> {
  const res = await fetch("/api/folders");
  if (!res.ok) {
    throw new Error(errorFromBody(await parseBody(res)));
  }
  return (await res.json()) as FolderSummary[];
}

/** Body for `POST /api/folders`. An omitted/empty `emoji` means the default. */
export type CreateFolderInput = {
  name: string;
  emoji?: string;
  description?: string;
};

/** Body for `PATCH /api/folders/[id]`. Omitted fields are unchanged; `null` clears `emoji`/`description`. */
export type UpdateFolderInput = {
  name?: string;
  emoji?: string | null;
  description?: string | null;
};

export function postFolder(
  input: CreateFolderInput,
): Promise<ActionResult<FolderSummary>> {
  return mutate<FolderSummary>("/api/folders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchFolder(
  id: string,
  input: UpdateFolderInput,
): Promise<ActionResult<FolderSummary>> {
  return mutate<FolderSummary>(`/api/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function removeFolder(
  id: string,
  withLinks: boolean,
): Promise<ActionResult<{ deletedLinks: number }>> {
  return mutate<{ deletedLinks: number }>(
    `/api/folders/${id}?withLinks=${withLinks}`,
    { method: "DELETE" },
  );
}

export function patchLinkFolder(
  linkId: string,
  folderId: string | null,
): Promise<ActionResult<Link>> {
  return mutate<Link>(`/api/links/${linkId}`, {
    method: "PATCH",
    body: JSON.stringify({ folderId }),
  });
}
