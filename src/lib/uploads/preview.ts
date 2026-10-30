/**
 * Preview sizing and generation. `fitWithin` is pure; `makePreview` runs in
 * the browser only (createImageBitmap, canvas, <video>, <audio>) and never
 * throws: every failure resolves to nulls.
 */

export const PREVIEW_MAX_PX = 1280;
export const PREVIEW_QUALITY = 0.82;

/** Scales to fit the long side within `max`; never upscales; rounds. */
export function fitWithin(
  width: number,
  height: number,
  max: number = PREVIEW_MAX_PX,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > max)) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type PreviewResult = {
  blob: Blob | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

const EMPTY: PreviewResult = {
  blob: null,
  width: null,
  height: null,
  duration: null,
};

const MEDIA_TIMEOUT_MS = 10_000;

export async function makePreview(
  file: File,
  mimeType: string,
): Promise<PreviewResult> {
  try {
    if (mimeType.startsWith("image/")) return await imagePreview(file, mimeType);
    if (mimeType.startsWith("video/")) return await videoPreview(file);
    if (mimeType.startsWith("audio/")) return await audioDuration(file);
  } catch {
    // fall through to the empty result
  }
  return { ...EMPTY };
}

function encode(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/jpeg",
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        // A browser that can't encode `type` hands back a PNG: not a preview.
        (blob) => resolve(blob && blob.type === type ? blob : null),
        type,
        PREVIEW_QUALITY,
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * The preview: WebP, else JPEG. Safari's canvas can't encode WebP, so
 * without the fallback every upload from an iPhone went without one (its
 * row showed Purl's icon, and the viewer decoded the full photo to open).
 */
async function toPreviewBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return (await encode(canvas, "image/webp")) ?? (await encode(canvas, "image/jpeg"));
}

async function imagePreview(
  file: File,
  mimeType: string,
): Promise<PreviewResult> {
  if (typeof createImageBitmap !== "function") return { ...EMPTY };

  // A GIF's original is its preview (it stays animated): report its size only.
  if (mimeType === "image/gif") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return { blob: null, ...size, duration: null };
  }

  // Decode once to learn the size, then again capped at the preview size so
  // a huge photo never sits fully decoded in memory beside its preview.
  const full = await createImageBitmap(file);
  const { width, height } = full;
  const target = fitWithin(width, height);
  let bitmap = full;
  if (target.width !== width || target.height !== height) {
    try {
      const resized = await createImageBitmap(file, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: "high",
      });
      full.close?.();
      bitmap = resized;
    } catch {
      // unsupported options: draw the full bitmap scaled instead
    }
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return { blob: null, width, height, duration: null };
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await toPreviewBlob(canvas);
    return { blob, width, height, duration: null };
  } finally {
    bitmap.close?.();
  }
}

/** Resolves true when `done` was called, false on `fail` or timeout. */
function waitFor(
  setup: (done: () => void, fail: () => void) => void,
  timeoutMs = MEDIA_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    setup(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/**
 * A length in whole seconds, as the row stores it (`createUploadForUser`
 * accepts only a positive integer): rounded, at least 1 for any positive
 * length (a half-second clip isn't 0), null when unknown, not finite or not
 * positive.
 */
export function roundDuration(seconds: number | null): number | null {
  if (seconds === null || !Number.isFinite(seconds) || !(seconds > 0)) {
    return null;
  }
  return Math.max(1, Math.round(seconds));
}

async function videoPreview(file: File): Promise<PreviewResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;

    const loaded = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), MEDIA_TIMEOUT_MS);
      video.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          resolve(false);
        },
        { once: true },
      );
    });
    video.src = url;
    if (!(await loaded)) return { ...EMPTY };

    const seconds = video.duration;
    const duration = roundDuration(seconds);
    const width = video.videoWidth || null;
    const height = video.videoHeight || null;
    if (!width || !height) return { ...EMPTY, duration };

    // A frame at 0.1 s skips a black first frame; a clip shorter than that
    // has only its first frame to give. Only the success events count: an
    // error or a timeout leaves no frame to draw.
    let ready: boolean;
    if (Number.isFinite(seconds) && seconds >= 0.1) {
      ready = await waitFor((done, fail) => {
        video.addEventListener("seeked", done, { once: true });
        video.addEventListener("error", fail, { once: true });
        video.currentTime = 0.1;
      });
    } else if (video.readyState >= 2) {
      ready = true;
    } else {
      ready = await waitFor((done, fail) => {
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("error", fail, { once: true });
      });
    }
    if (!ready || video.readyState < 2) {
      return { blob: null, width, height, duration };
    }

    const target = fitWithin(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return { blob: null, width, height, duration };
    context.drawImage(video, 0, 0, target.width, target.height);
    const blob = await toPreviewBlob(canvas);
    return { blob, width, height, duration };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function audioDuration(file: File): Promise<PreviewResult> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  try {
    audio.preload = "metadata";
    const loaded = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), MEDIA_TIMEOUT_MS);
      audio.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          resolve(false);
        },
        { once: true },
      );
    });
    audio.src = url;
    if (!(await loaded)) return { ...EMPTY };
    return { ...EMPTY, duration: roundDuration(audio.duration) };
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
