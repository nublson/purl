import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.hoisted(() => vi.fn());
const makePreviewMock = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob/client", () => ({ put: putMock }));
// Only the browser-bound `makePreview` is faked; the pure helpers are real.
vi.mock("./uploads/preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./uploads/preview")>()),
  makePreview: makePreviewMock,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

import type { PendingUpload } from "./pending-upload";
import {
  forgetUpload,
  rateLimitedMessage,
  retryUpload,
  uploadFiles,
} from "./save-uploads";

const USER = "user1";
const BLOB_HOST = "https://store.public.blob.vercel-storage.com";

type Json = Record<string, unknown>;

function jsonResponse(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function linkJson(id: string): Json {
  return {
    id,
    favicon: "/icon.png",
    title: id,
    description: null,
    thumbnail: null,
    url: `${BLOB_HOST}/${id}`,
    domain: "purl.live",
    contentType: "IMAGE",
    createdAt: "2026-10-27T10:00:00.000Z",
    folderId: null,
    mimeType: "image/png",
    width: 10,
    height: 10,
    duration: null,
    frameable: null,
    embed: false,
    upload: true,
    moved: false,
  };
}

function png(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

type Call = { url: string; body: Json };

/** Records each request; answers tokens and rows unless `answer` overrides. */
function stubFetch(answer?: (call: Call, index: number) => Response | undefined) {
  const calls: Call[] = [];
  let rows = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Json,
    };
    calls.push(call);
    const custom = answer?.(call, calls.length - 1);
    if (custom) return custom;
    if (call.url === "/api/uploads/token") {
      return jsonResponse(200, {
        type: "blob.generate-client-token",
        clientToken: `token-${calls.length}`,
      });
    }
    rows += 1;
    return jsonResponse(201, linkJson(`link-${rows}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function handlers() {
  return {
    userId: USER,
    onStart: vi.fn<(item: PendingUpload) => void>(),
    onProgress: vi.fn<(id: string, progress: number) => void>(),
    onPreview: vi.fn(),
    onDone: vi.fn<(id: string, link: unknown) => Promise<void>>(async () => {}),
    onError: vi.fn<(id: string, message: string) => void>(),
    onBatchDone: vi.fn(),
  };
}

function tokenCalls(calls: Call[]) {
  return calls.filter((call) => call.url === "/api/uploads/token");
}

function rowCalls(calls: Call[]) {
  return calls.filter((call) => call.url === "/api/links");
}

function payloadOf(call: Call) {
  const payload = call.body.payload as Json;
  return {
    pathname: payload.pathname as string,
    clientPayload: JSON.parse(payload.clientPayload as string) as Json,
    multipart: payload.multipart,
    hasCallbackUrl: "callbackUrl" in payload,
  };
}

beforeEach(() => {
  vi.stubGlobal("location", { origin: "https://purl.test" });
  let objectUrls = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    () => `blob:local/${++objectUrls}`,
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  putMock.mockImplementation(async (pathname: string) => ({
    url: `${BLOB_HOST}/${pathname}`,
    pathname,
  }));
  makePreviewMock.mockResolvedValue({
    blob: new Blob([new Uint8Array(10)], { type: "image/webp" }),
    width: 640,
    height: 480,
    duration: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  putMock.mockReset();
  makePreviewMock.mockReset();
  toastError.mockReset();
});

describe("uploadFiles", () => {
  it("runs at most 3 uploads at once, in order, and finishes them all", async () => {
    stubFetch();
    let inFlight = 0;
    let maxInFlight = 0;
    const started: string[] = [];
    putMock.mockImplementation(async (pathname: string) => {
      if (!pathname.endsWith("preview.webp")) started.push(pathname);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { url: `${BLOB_HOST}/${pathname}`, pathname };
    });
    const h = handlers();
    const files = ["a", "b", "c", "d", "e"].map((n) => png(`${n}.png`));

    await uploadFiles(files, h);

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(h.onDone).toHaveBeenCalledTimes(5);
    expect(started.map((path) => path.split("/").pop())).toEqual([
      "a.png",
      "b.png",
      "c.png",
      "d.png",
      "e.png",
    ]);
    expect(h.onBatchDone).toHaveBeenCalledTimes(1);
    expect(h.onBatchDone).toHaveBeenCalledWith({ uploaded: 5 });
  });

  it("toasts a rejected file and never uploads it", async () => {
    const { calls } = stubFetch();
    const h = handlers();
    const heic = new File([new Uint8Array(10)], "photo.heic", {
      type: "image/heic",
    });

    await uploadFiles([heic, png("ok.png")], h);

    expect(toastError).toHaveBeenCalledWith(
      "photo.heic isn't a supported format. Use JPEG, PNG, GIF, WebP, AVIF or SVG for images.",
    );
    expect(h.onStart).toHaveBeenCalledTimes(1);
    expect(h.onStart.mock.calls[0][0].name).toBe("ok.png");
    expect(
      tokenCalls(calls).some((call) =>
        payloadOf(call).pathname.includes("photo"),
      ),
    ).toBe(false);
    expect(putMock.mock.calls.every(([path]) => !String(path).includes("photo"))).toBe(
      true,
    );
  });

  it("asks for the file's token with its kind, type and size, under the user's folder", async () => {
    const { calls } = stubFetch();
    const h = handlers();

    await uploadFiles([png("My photo.png", 1234)], h);

    const [fileToken, previewToken] = tokenCalls(calls).map(payloadOf);
    expect(fileToken.clientPayload).toEqual({
      kind: "file",
      mimeType: "image/png",
      size: 1234,
    });
    expect(fileToken.multipart).toBe(true);
    // No upload-completed callback: Purl creates the pearl itself.
    expect(fileToken.hasCallbackUrl).toBe(false);
    expect(previewToken.hasCallbackUrl).toBe(false);
    expect(fileToken.pathname).toMatch(/^users\/user1\/[0-9a-f]{32}\/My-photo\.png$/);
    expect(previewToken.clientPayload).toEqual({
      kind: "preview",
      mimeType: "image/webp",
      size: 10,
    });
    const folder = fileToken.pathname.split("/")[2];
    expect(previewToken.pathname).toBe(`users/user1/${folder}/preview.webp`);
    expect(tokenCalls(calls)[0].body.type).toBe("blob.generate-client-token");

    // Uploaded with the token the route answered.
    const filePut = putMock.mock.calls.find(([path]) => path === fileToken.pathname);
    expect(filePut?.[2]).toMatchObject({
      access: "public",
      multipart: true,
      contentType: "image/png",
    });
    expect(typeof filePut?.[2].token).toBe("string");
  });

  it("creates the row with the file's url and the preview's url", async () => {
    const { calls } = stubFetch();
    const h = handlers();

    await uploadFiles([png("a.png")], { ...h, folderId: "folder1" });

    const [row] = rowCalls(calls);
    const upload = row.body.upload as Json;
    const filePath = putMock.mock.calls[0][0] as string;
    const previewPath = putMock.mock.calls[1][0] as string;
    expect(upload).toEqual({
      url: `${BLOB_HOST}/${filePath}`,
      previewUrl: `${BLOB_HOST}/${previewPath}`,
      name: "a.png",
      mimeType: "image/png",
      width: 640,
      height: 480,
      duration: null,
    });
    expect(row.body.folderId).toBe("folder1");
    expect(h.onDone).toHaveBeenCalledTimes(1);
    const [id, link] = h.onDone.mock.calls[0];
    expect(id).toBe(h.onStart.mock.calls[0][0].id);
    expect((link as { id: string; createdAt: Date }).id).toBe("link-1");
    expect((link as { createdAt: Date }).createdAt).toBeInstanceOf(Date);
  });

  it("sends previewUrl null when there's no preview", async () => {
    const { calls } = stubFetch();
    makePreviewMock.mockResolvedValue({
      blob: null,
      width: 320,
      height: 200,
      duration: null,
    });
    const h = handlers();

    await uploadFiles([png("a.png")], h);

    expect(tokenCalls(calls)).toHaveLength(1);
    expect(putMock).toHaveBeenCalledTimes(1);
    const upload = rowCalls(calls)[0].body.upload as Json;
    expect(upload.previewUrl).toBeNull();
    expect(upload.width).toBe(320);
    expect(rowCalls(calls)[0].body).not.toHaveProperty("folderId");
  });

  it("sends a video's duration in whole seconds", async () => {
    const { calls } = stubFetch();
    makePreviewMock.mockResolvedValue({
      blob: new Blob([new Uint8Array(10)], { type: "image/webp" }),
      width: 1920,
      height: 1080,
      duration: 14.533,
    });
    const clip = new File([new Uint8Array(100)], "clip.mp4", { type: "video/mp4" });

    await uploadFiles([clip], handlers());

    const upload = rowCalls(calls)[0].body.upload as Json;
    expect(upload.mimeType).toBe("video/mp4");
    expect(upload.duration).toBe(15);
    expect(Number.isInteger(upload.duration)).toBe(true);
  });

  it("stops the remaining files at the storage limit, toasting once", async () => {
    const message =
      "Your 250 MB of storage is full. Delete files you no longer need to upload more.";
    stubFetch((call) => {
      if (
        call.url === "/api/uploads/token" &&
        payloadOf(call).clientPayload.kind === "file" &&
        !payloadOf(call).pathname.endsWith("a.png")
      ) {
        return jsonResponse(403, {
          error: message,
          code: "LIMIT_REACHED",
          feature: "STORAGE_LIMIT",
        });
      }
      return undefined;
    });
    const h = handlers();
    const files = ["a", "b", "c", "d", "e", "f"].map((n) => png(`${n}.png`));

    await uploadFiles(files, h);

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(message);
    // a uploads; b and c (in flight with it) fail; d, e and f never start.
    const startedNames = h.onStart.mock.calls.map(([item]) => item.name);
    expect(startedNames).toEqual(["a.png", "b.png", "c.png"]);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onError).toHaveBeenCalledTimes(2);
    expect(h.onBatchDone).toHaveBeenCalledTimes(1);
    expect(h.onBatchDone).toHaveBeenCalledWith({ uploaded: 1 });
  });

  it("stops the queue when the row hits the link limit", async () => {
    stubFetch((call) =>
      call.url === "/api/links"
        ? jsonResponse(403, {
            error: "You've reached the 1,000-link limit.",
            code: "LIMIT_REACHED",
            feature: "SAVE_LIMIT",
          })
        : undefined,
    );
    const h = handlers();

    await uploadFiles(
      ["a", "b", "c", "d"].map((n) => png(`${n}.png`)),
      h,
    );

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(h.onStart).toHaveBeenCalledTimes(3);
    expect(h.onDone).not.toHaveBeenCalled();
    expect(h.onBatchDone).toHaveBeenCalledTimes(1);
  });

  it("fails only the file that's rate-limited; the rest continue", async () => {
    stubFetch((call) =>
      call.url === "/api/uploads/token" && payloadOf(call).pathname.endsWith("b.png")
        ? jsonResponse(429, { error: "Too many requests" })
        : undefined,
    );
    const h = handlers();

    await uploadFiles(
      ["a", "b", "c", "d"].map((n) => png(`${n}.png`)),
      h,
    );

    expect(toastError).toHaveBeenCalledWith(
      "Too many uploads at once. Try again in a minute.",
      { id: "upload-rate-limited" },
    );
    expect(h.onDone).toHaveBeenCalledTimes(3);
    expect(h.onError).toHaveBeenCalledTimes(1);
    const failedId = h.onError.mock.calls[0][0];
    const b = h.onStart.mock.calls.find(([item]) => item.name === "b.png")?.[0];
    expect(failedId).toBe(b?.id);
  });

  it("words the 429 toast from Retry-After", async () => {
    stubFetch((call) =>
      call.url === "/api/uploads/token"
        ? new Response(JSON.stringify({ error: "Too many requests" }), {
            status: 429,
            headers: { "content-type": "application/json", "Retry-After": "1750" },
          })
        : undefined,
    );
    const h = handlers();

    await uploadFiles([png("a.png")], h);

    expect(toastError).toHaveBeenCalledWith(
      "Too many uploads at once. Try again in 30 minutes.",
      { id: "upload-rate-limited" },
    );
    expect(h.onError).toHaveBeenCalledWith(
      expect.any(String),
      "Too many uploads at once. Try again in 30 minutes.",
    );
  });

  it("cancels the queue when uploads aren't available", async () => {
    stubFetch((call) =>
      call.url === "/api/uploads/token"
        ? jsonResponse(503, {
            error: "Uploads aren't available here",
            code: "UPLOADS_UNAVAILABLE",
          })
        : undefined,
    );
    const h = handlers();

    await uploadFiles(
      ["a", "b", "c", "d"].map((n) => png(`${n}.png`)),
      h,
    );

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("Uploads aren't available here");
    expect(h.onStart).toHaveBeenCalledTimes(3);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("fails a file whose upload throws, without a toast", async () => {
    stubFetch();
    putMock.mockImplementation(async (pathname: string) => {
      if (pathname.endsWith("a.png")) throw new Error("network");
      return { url: `${BLOB_HOST}/${pathname}`, pathname };
    });
    const h = handlers();

    await uploadFiles([png("a.png"), png("b.png")], h);

    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onError.mock.calls[0][1]).toBe("Couldn't upload a.png");
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports progress from the file's upload", async () => {
    stubFetch();
    putMock.mockImplementation(
      async (
        pathname: string,
        _body: unknown,
        options: { onUploadProgress?: (event: { percentage: number }) => void },
      ) => {
        options.onUploadProgress?.({ percentage: 42.4 });
        options.onUploadProgress?.({ percentage: 100 });
        return { url: `${BLOB_HOST}/${pathname}`, pathname };
      },
    );
    const h = handlers();

    await uploadFiles([png("a.png")], h);

    const id = h.onStart.mock.calls[0][0].id;
    expect(h.onProgress).toHaveBeenCalledWith(id, 42);
    // Not 100 until the pearl exists: its card takes the slot then.
    expect(h.onProgress).not.toHaveBeenCalledWith(id, 100);
  });

  it("starts each item uploading, with the local preview and its kind", async () => {
    stubFetch();
    const h = handlers();
    const audio = new File([new Uint8Array(10)], "song.mp3", { type: "audio/mpeg" });

    await uploadFiles([png("a.png"), audio], h);

    const [image, song] = h.onStart.mock.calls.map(([item]) => item);
    expect(image).toMatchObject({
      name: "a.png",
      kind: "image",
      status: "uploading",
      progress: 0,
    });
    expect(image.previewUrl).toMatch(/^blob:/);
    expect(image.id).toMatch(/^[0-9a-f]{32}$/);
    expect(song).toMatchObject({ kind: "audio", previewUrl: null });
  });
});

describe("uploadFiles, leaving and throwing", () => {
  it("never starts queued files once its signal is aborted", async () => {
    stubFetch();
    const controller = new AbortController();
    const h = { ...handlers(), signal: controller.signal };
    // The page leaves once the first pearl lands.
    h.onDone.mockImplementation(async () => controller.abort());

    await uploadFiles(["a", "b", "c", "d", "e"].map((n) => png(`${n}.png`)), h);

    // The three in flight finish; d and e never start.
    expect(h.onStart).toHaveBeenCalledTimes(3);
    expect(h.onDone).toHaveBeenCalledTimes(3);
    expect(h.onBatchDone).toHaveBeenCalledTimes(1);
  });

  it("fails a file whose onStart throws and keeps going with the rest", async () => {
    stubFetch();
    const h = handlers();
    h.onStart.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    await expect(
      uploadFiles([png("a.png"), png("b.png")], h),
    ).resolves.toBeUndefined();

    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledTimes(1);
    expect(h.onBatchDone).toHaveBeenCalledTimes(1);
  });
});

describe("retryUpload", () => {
  it("revokes the old preview only after the retry's item replaced it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      let fail = true;
      stubFetch((call) =>
        call.url === "/api/links" && fail ? jsonResponse(500, {}) : undefined,
      );
      const h = handlers();
      await uploadFiles([png("a.png")], h);
      const first = h.onStart.mock.calls[0][0];
      const revoke = vi.mocked(URL.revokeObjectURL);
      expect(revoke).not.toHaveBeenCalled();

      fail = false;
      const revokedAtRestart: string[][] = [];
      h.onStart.mockImplementation(() => {
        revokedAtRestart.push(revoke.mock.calls.map(([url]) => url));
      });
      await retryUpload(first.id, h);

      // Not yet when the new item went up…
      expect(revokedAtRestart).toEqual([[]]);
      // …a moment later.
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith(first.previewUrl);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-runs a failed file under the same id", async () => {
    let fail = true;
    stubFetch((call) =>
      call.url === "/api/links" && fail
        ? jsonResponse(500, { error: "Server error" })
        : undefined,
    );
    const h = handlers();
    await uploadFiles([png("a.png")], h);
    const id = h.onStart.mock.calls[0][0].id;
    expect(h.onError).toHaveBeenCalledWith(id, "Server error");

    fail = false;
    expect(await retryUpload(id, h)).toBe(true);

    expect(h.onStart).toHaveBeenCalledTimes(2);
    expect(h.onStart.mock.calls[1][0].id).toBe(id);
    expect(h.onDone).toHaveBeenCalledWith(id, expect.anything());
    expect(h.onBatchDone).toHaveBeenCalledTimes(2);
  });

  it("does nothing for a forgotten file", async () => {
    stubFetch((call) =>
      call.url === "/api/links" ? jsonResponse(500, {}) : undefined,
    );
    const h = handlers();
    await uploadFiles([png("a.png")], h);
    const id = h.onStart.mock.calls[0][0].id;

    forgetUpload(id);
    expect(await retryUpload(id, h)).toBe(false);

    expect(h.onStart).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe("rateLimitedMessage", () => {
  it("says a minute without Retry-After, or with an unreadable one", () => {
    expect(rateLimitedMessage(null)).toBe(
      "Too many uploads at once. Try again in a minute.",
    );
    expect(rateLimitedMessage("soon")).toBe(
      "Too many uploads at once. Try again in a minute.",
    );
  });

  it("says a minute under 90 seconds", () => {
    expect(rateLimitedMessage("1")).toBe(
      "Too many uploads at once. Try again in a minute.",
    );
    expect(rateLimitedMessage("89")).toBe(
      "Too many uploads at once. Try again in a minute.",
    );
  });

  it("counts minutes, rounded up, from 90 seconds", () => {
    expect(rateLimitedMessage("90")).toBe(
      "Too many uploads at once. Try again in 2 minutes.",
    );
    expect(rateLimitedMessage("3600")).toBe(
      "Too many uploads at once. Try again in 60 minutes.",
    );
  });
});
