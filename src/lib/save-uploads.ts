"use client";

import { put } from "@vercel/blob/client";
import { toast } from "sonner";
import { linksOriginHeaders } from "@/lib/links-origin";
import { MAX_CONCURRENT_UPLOADS } from "@/lib/limits";
import type { PendingUpload } from "@/lib/pending-upload";
import { contentTypeForMime, sanitizeUploadName } from "@/lib/uploads/mime";
import { makePreview, roundDuration } from "@/lib/uploads/preview";
import { validateUploadFile } from "@/lib/uploads/validate";
import { parseJsonLinks, type Link } from "@/utils/links";

const TOKEN_ROUTE = "/api/uploads/token";
const PREVIEW_MIME_TYPE = "image/webp";
const UNAVAILABLE_MESSAGE = "Uploads aren't available here";
/** Object URLs outlive their item a moment, until what replaced it is drawn. */
const REVOKE_DELAY_MS = 1000;

export type UploadHandlers = {
  /** The signed-in user: the files go under `users/<userId>/`. */
  userId: string;
  /** Files the pearls into this folder (a folder page). */
  folderId?: string | null;
  /** A file starts: show its pending item (a retry reuses its id). */
  onStart(item: PendingUpload): void;
  /** The file's upload progress, 0–99 (the pearl's arrival is 100). */
  onProgress(id: string, progress: number): void;
  /** The preview is ready: its size, and for a video its poster frame. */
  onPreview?(
    id: string,
    patch: Partial<Pick<PendingUpload, "previewUrl" | "width" | "height">>,
  ): void;
  /** The pearl exists: awaited, so its card takes the item's slot. */
  onDone(id: string, link: Link): Promise<void>;
  /** This file failed; the item stays, with Retry and Dismiss. */
  onError(id: string, message: string): void;
  /** Always once, when the batch has nothing left to run. */
  onBatchDone(outcome: { uploaded: number }): void;
  /** Aborted (the page left): files not yet started never start. */
  signal?: AbortSignal;
};

type QueuedFile = { id: string; file: File; mimeType: string };

/**
 * Files on the page, by pending id: the `File` (for Retry) and the object
 * URLs made for it (revoked when it's forgotten).
 */
const kept = new Map<string, QueuedFile & { objectUrls: string[] }>();

function revokeUrls(urls: string[]) {
  for (const url of urls) URL.revokeObjectURL(url);
}

/** Dismiss (or a finished upload): the file and its object URLs go. */
export function forgetUpload(id: string) {
  const entry = kept.get(id);
  if (!entry) return;
  kept.delete(id);
  revokeUrls(entry.objectUrls);
}

/** Uploads at once across every batch (a second drop waits its turn). */
let activeUploads = 0;
const slotWaiters: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (activeUploads < MAX_CONCURRENT_UPLOADS) {
    activeUploads += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => slotWaiters.push(resolve));
}

function releaseSlot() {
  const next = slotWaiters.shift();
  // The slot passes straight to the next file in line.
  if (next) next();
  else activeUploads -= 1;
}

/** The token route or `POST /api/links` said no. */
class UploadRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    /** A 429's `Retry-After` header (seconds), as sent. */
    readonly retryAfter: string | null = null,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<UploadRequestError> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: unknown;
    code?: unknown;
  };
  return new UploadRequestError(
    res.status,
    typeof data.error === "string" ? data.error : "",
    typeof data.code === "string" ? data.code : undefined,
    res.headers.get("Retry-After"),
  );
}

/**
 * The 429 toast, worded from `Retry-After` (seconds): the per-IP limit resets
 * within a minute, the per-user one (240 tokens an hour) can take longer.
 */
export function rateLimitedMessage(retryAfter: string | null): string {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const wait =
    Number.isFinite(seconds) && seconds >= 90
      ? `${Math.ceil(seconds / 60)} minutes`
      : "a minute";
  return `Too many uploads at once. Try again in ${wait}.`;
}

/** A Blob client token for exactly this pathname, type and size. */
async function requestClientToken(
  pathname: string,
  payload: { kind: "file" | "preview"; mimeType: string; size: number },
  multipart: boolean,
): Promise<string> {
  const res = await fetch(TOKEN_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname,
        clientPayload: JSON.stringify(payload),
        multipart,
      },
    }),
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json().catch(() => ({}))) as { clientToken?: unknown };
  if (typeof data.clientToken !== "string") {
    throw new UploadRequestError(res.status, "");
  }
  return data.clientToken;
}

/** A fresh id per upload: the pathname's folder and the pending item's id. */
function newUploadId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function kindOf(mimeType: string): PendingUpload["kind"] {
  const type = contentTypeForMime(mimeType);
  return type === "VIDEO" ? "video" : type === "AUDIO" ? "audio" : "image";
}

type Batch = { cancelled: boolean; toasted: boolean; uploaded: number };

/** Uploads one file and its preview, then creates its pearl. */
async function uploadOne(
  { id, file, mimeType }: QueuedFile,
  handlers: UploadHandlers,
  batch: Batch,
) {
  const kind = kindOf(mimeType);
  const objectUrls: string[] = [];
  // A retry's previous URLs are on screen until `onStart` replaces them.
  const stale = kept.get(id)?.objectUrls ?? [];
  kept.set(id, { id, file, mimeType, objectUrls });

  try {
    const previewUrl = kind === "audio" ? null : URL.createObjectURL(file);
    if (previewUrl) objectUrls.push(previewUrl);
    handlers.onStart({
      id,
      name: file.name,
      kind,
      previewUrl,
      progress: 0,
      status: "uploading",
      message: null,
      width: null,
      height: null,
    });
    if (stale.length > 0) setTimeout(() => revokeUrls(stale), REVOKE_DELAY_MS);

    const preview = await makePreview(file, mimeType);
    if (preview.width !== null || preview.blob) {
      const patch: Parameters<NonNullable<UploadHandlers["onPreview"]>>[1] = {
        width: preview.width,
        height: preview.height,
      };
      // A video's file can't be drawn as an image: its poster frame can.
      if (kind === "video" && preview.blob) {
        patch.previewUrl = URL.createObjectURL(preview.blob);
        objectUrls.push(patch.previewUrl);
      }
      handlers.onPreview?.(id, patch);
    }

    const folder = `users/${handlers.userId}/${id}`;
    const pathname = `${folder}/${sanitizeUploadName(file.name, mimeType)}`;
    const fileToken = await requestClientToken(
      pathname,
      { kind: "file", mimeType, size: file.size },
      true,
    );
    const uploaded = await put(pathname, file, {
      access: "public",
      token: fileToken,
      contentType: mimeType,
      multipart: true,
      onUploadProgress: ({ percentage }) =>
        handlers.onProgress(id, Math.min(99, Math.round(percentage))),
    });

    // The preview is a nicety: when it can't be stored, the pearl goes
    // without one (the card draws the file itself).
    let remotePreviewUrl: string | null = null;
    if (preview.blob) {
      try {
        const previewPath = `${folder}/preview.webp`;
        const previewToken = await requestClientToken(
          previewPath,
          { kind: "preview", mimeType: PREVIEW_MIME_TYPE, size: preview.blob.size },
          false,
        );
        const stored = await put(previewPath, preview.blob, {
          access: "public",
          token: previewToken,
          contentType: PREVIEW_MIME_TYPE,
        });
        remotePreviewUrl = stored.url;
      } catch {
        remotePreviewUrl = null;
      }
    }

    const body: { upload: Record<string, unknown>; folderId?: string } = {
      upload: {
        url: uploaded.url,
        previewUrl: remotePreviewUrl,
        name: file.name,
        mimeType,
        width: preview.width,
        height: preview.height,
        // Whole seconds, as the row requires (`makePreview` rounds already).
        duration: roundDuration(preview.duration),
      },
    };
    if (handlers.folderId) body.folderId = handlers.folderId;
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...linksOriginHeaders },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await readError(res);
    const [link] = parseJsonLinks([await res.json()]);

    batch.uploaded += 1;
    await handlers.onDone(id, link);
    // A moment later, once the pearl's card has taken the item's place.
    kept.delete(id);
    setTimeout(() => revokeUrls(objectUrls), REVOKE_DELAY_MS);
  } catch (error) {
    handlers.onError(id, failureMessage(error, file, batch));
  }
}

/** Toasts what the whole batch needs to know; returns the item's message. */
function failureMessage(error: unknown, file: File, batch: Batch): string {
  const fallback = `Couldn't upload ${file.name}`;
  if (!(error instanceof UploadRequestError)) return fallback;

  const stopsQueue =
    (error.status === 403 && error.code === "LIMIT_REACHED") ||
    (error.status === 503 && error.code === "UPLOADS_UNAVAILABLE");
  if (stopsQueue) {
    const message =
      error.status === 503 ? UNAVAILABLE_MESSAGE : error.message || fallback;
    batch.cancelled = true;
    if (!batch.toasted) {
      batch.toasted = true;
      toast.error(message);
    }
    return message;
  }
  if (error.status === 429) {
    // One toast however many files a batch has rate-limited.
    const message = rateLimitedMessage(error.retryAfter);
    toast.error(message, { id: "upload-rate-limited" });
    return message;
  }
  return error.message || fallback;
}

async function runBatch(files: QueuedFile[], handlers: UploadHandlers) {
  const batch: Batch = { cancelled: false, toasted: false, uploaded: 0 };
  try {
    // Every file takes its place in line now, so they start in order. One
    // file throwing never ends the others.
    await Promise.allSettled(
      files.map(async (queued) => {
        await acquireSlot();
        try {
          if (!batch.cancelled && !handlers.signal?.aborted) {
            await uploadOne(queued, handlers, batch);
          }
        } finally {
          releaseSlot();
        }
      }),
    );
  } finally {
    handlers.onBatchDone({ uploaded: batch.uploaded });
  }
}

/**
 * Turns files into pearls: each is validated (a rejection toasts why), then
 * the rest upload `MAX_CONCURRENT_UPLOADS` at a time, in order. Per file: its
 * pending item, its preview, the file and the preview to Blob, then
 * `POST /api/links { upload }`. A limit (or uploads being off) toasts once
 * and stops the files not yet started; any other failure fails that file
 * only.
 */
export async function uploadFiles(
  files: File[],
  handlers: UploadHandlers,
): Promise<void> {
  const queued: QueuedFile[] = [];
  for (const file of files) {
    const check = validateUploadFile(file);
    if (!check.ok) {
      toast.error(check.message);
      continue;
    }
    queued.push({ id: newUploadId(), file, mimeType: check.mimeType });
  }
  await runBatch(queued, handlers);
}

/**
 * Retry: the kept file runs again under the same id (same item, same slot).
 * False when the file is no longer kept (nothing to run).
 */
export async function retryUpload(
  id: string,
  handlers: UploadHandlers,
): Promise<boolean> {
  const entry = kept.get(id);
  if (!entry) return false;
  await runBatch(
    [{ id, file: entry.file, mimeType: entry.mimeType }],
    handlers,
  );
  return true;
}

/** DOM event the entry points (+ menu, drop, paste) use to hand files to the page. */
export const UPLOAD_FILES_EVENT = "purl:upload-files";

/**
 * Asks the mounted page (`HomeShell`) to upload `files`. Returns false when
 * no page handled it.
 */
export function requestUploadFiles(files: File[]): boolean {
  const event = new CustomEvent<File[]>(UPLOAD_FILES_EVENT, {
    detail: files,
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}
