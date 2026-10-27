import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/limits";
import { validateUploadFile } from "./validate";

describe("validateUploadFile", () => {
  it("falls back to the extension when the type is empty", () => {
    expect(validateUploadFile({ name: "song.m4a", type: "", size: 10 })).toEqual(
      { ok: true, mimeType: "audio/x-m4a" },
    );
  });

  it("accepts an allowed reported type", () => {
    expect(
      validateUploadFile({ name: "a.png", type: "image/png", size: 10 }),
    ).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("accepts both audio/mp4 and audio/x-m4a", () => {
    expect(
      validateUploadFile({ name: "a.m4a", type: "audio/mp4", size: 10 }),
    ).toEqual({ ok: true, mimeType: "audio/mp4" });
    expect(
      validateUploadFile({ name: "a.m4a", type: "audio/x-m4a", size: 10 }),
    ).toEqual({ ok: true, mimeType: "audio/x-m4a" });
  });

  it("prefers the reported type when allowed, even if the extension differs", () => {
    expect(
      validateUploadFile({ name: "a.mp3", type: "audio/wav", size: 10 }),
    ).toEqual({ ok: true, mimeType: "audio/wav" });
  });

  it("uses the extension's type when the reported one is not allowed", () => {
    expect(
      validateUploadFile({ name: "a.m4v", type: "video/x-m4v", size: 10 }),
    ).toEqual({ ok: true, mimeType: "video/mp4" });
    expect(
      validateUploadFile({ name: "a.wav", type: "audio/x-wav", size: 10 }),
    ).toEqual({ ok: true, mimeType: "audio/wav" });
  });

  it("rejects an unsupported type", () => {
    expect(
      validateUploadFile({ name: "photo.heic", type: "image/heic", size: 10 }),
    ).toEqual({
      ok: false,
      reason: "type",
      message:
        "photo.heic isn't a supported format. Use JPEG, PNG, GIF, WebP, AVIF or SVG for images.",
    });
  });

  it("rejects an empty type with an unknown extension", () => {
    expect(validateUploadFile({ name: "notes", type: "", size: 10 })).toEqual({
      ok: false,
      reason: "type",
      message:
        "notes isn't a supported format. Upload an image, video or audio file.",
    });
  });

  it("rejects a file over 25 MB", () => {
    expect(
      validateUploadFile({
        name: "clip.mov",
        type: "video/quicktime",
        size: 25 * 1024 * 1024 + 1,
      }),
    ).toEqual({
      ok: false,
      reason: "size",
      message: "clip.mov is over 25 MB",
    });
  });

  it("accepts a file of exactly 25 MB", () => {
    expect(
      validateUploadFile({
        name: "clip.mov",
        type: "video/quicktime",
        size: MAX_UPLOAD_FILE_BYTES,
      }),
    ).toEqual({ ok: true, mimeType: "video/quicktime" });
  });

  it("reports the type before the size", () => {
    expect(
      validateUploadFile({
        name: "photo.heic",
        type: "image/heic",
        size: MAX_UPLOAD_FILE_BYTES + 1,
      }),
    ).toMatchObject({ ok: false, reason: "type" });
  });

  it("rejects an empty file", () => {
    expect(
      validateUploadFile({ name: "a.png", type: "image/png", size: 0 }),
    ).toMatchObject({ ok: false, reason: "type" });
  });

  it("fails closed on a NaN size", () => {
    expect(
      validateUploadFile({ name: "a.png", type: "image/png", size: NaN }),
    ).toMatchObject({ ok: false });
  });
});

describe("unsupportedFormatMessage", () => {
  it("names the kind's formats when the extension says which kind", async () => {
    const { unsupportedFormatMessage } = await import("./validate");
    expect(unsupportedFormatMessage("clip.avi")).toBe(
      "clip.avi isn't a supported format. Use MP4, WebM or MOV for video.",
    );
    expect(unsupportedFormatMessage("song.aiff")).toBe(
      "song.aiff isn't a supported format. Use MP3, M4A, WAV, OGG or FLAC for audio.",
    );
    expect(unsupportedFormatMessage("Scan.TIFF")).toBe(
      "Scan.TIFF isn't a supported format. Use JPEG, PNG, GIF, WebP, AVIF or SVG for images.",
    );
  });
});
