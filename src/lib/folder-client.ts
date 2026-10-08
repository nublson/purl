"use client";

import type { MoveLinksResult } from "@/lib/bulk-links";
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


async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function errorFromBody(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
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

/**
 * Runs a mutating fetch and maps it to `ActionResult`, never throwing.
 * `failure` names the action for the fallback errors ("Unable to {failure}.")
 * used when the API sends no message or the request never reaches it.
 */
async function mutate<T>(
  path: string,
  init: RequestInit,
  failure: string,
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
        error: errorFromBody(body, `Unable to ${failure}. Try again.`),
        ...(code ? { code } : {}),
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      error: `Unable to ${failure}. Check your connection and try again.`,
    };
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
    throw new Error(
      errorFromBody(await parseBody(res), "Unable to load folders. Try again."),
    );
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
  /** Share at `/@username/slug` (`true`) or make private again. */
  isPublic?: boolean;
};

export function postFolder(
  input: CreateFolderInput,
): Promise<ActionResult<FolderSummary>> {
  return mutate<FolderSummary>("/api/folders", {
    method: "POST",
    body: JSON.stringify(input),
  }, "create the folder");
}

export function patchFolder(
  id: string,
  input: UpdateFolderInput,
): Promise<ActionResult<FolderSummary>> {
  return mutate<FolderSummary>(`/api/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }, "save the folder");
}

export function removeFolder(
  id: string,
  withLinks: boolean,
): Promise<ActionResult<{ deletedLinks: number }>> {
  return mutate<{ deletedLinks: number }>(
    `/api/folders/${id}?withLinks=${withLinks}`,
    { method: "DELETE" },
    "delete the folder",
  );
}

const FOLDER_ORDER_TIMEOUT_MS = 15_000;

/** Sets the folder order; `ids` lists every folder, first to last. */
export function putFolderOrder(
  ids: string[],
): Promise<ActionResult<{ folders: FolderSummary[] }>> {
  return mutate<{ folders: FolderSummary[] }>("/api/folders/order", {
    method: "PUT",
    body: JSON.stringify({ ids }),
    // A save holds folder refreshes and queues the next one: never for long.
    signal: AbortSignal.timeout(FOLDER_ORDER_TIMEOUT_MS),
  }, "save the folder order");
}

export function patchLinkFolder(
  linkId: string,
  folderId: string | null,
): Promise<ActionResult<Link>> {
  return mutate<Link>(`/api/links/${linkId}`, {
    method: "PATCH",
    body: JSON.stringify({ folderId }),
  }, "move the link");
}

/** Moves many links at once (`folderId: null` takes them out of their folders). */
export function patchLinksFolder(
  linkIds: string[],
  folderId: string | null,
): Promise<ActionResult<MoveLinksResult>> {
  return mutate<MoveLinksResult>("/api/links/bulk", {
    method: "PATCH",
    body: JSON.stringify({ ids: linkIds, folderId }),
  }, "move the links");
}
