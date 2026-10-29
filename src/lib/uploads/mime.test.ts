import { describe, expect, it } from "vitest";
import {
  UPLOAD_MIME_TYPES,
  contentTypeForMime,
  extensionToMime,
  sanitizeUploadName,
} from "./mime";

describe("UPLOAD_MIME_TYPES", () => {
  it("lists the allowed types", () => {
    expect(UPLOAD_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/svg+xml",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/ogg",
      "audio/flac",
    ]);
  });
});

describe("extensionToMime", () => {
  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.gif", "image/gif"],
    ["a.webp", "image/webp"],
    ["a.avif", "image/avif"],
    ["a.svg", "image/svg+xml"],
    ["a.mp4", "video/mp4"],
    ["a.m4v", "video/mp4"],
    ["a.webm", "video/webm"],
    ["a.mov", "video/quicktime"],
    ["a.mp3", "audio/mpeg"],
    ["a.m4a", "audio/x-m4a"],
    ["a.wav", "audio/wav"],
    ["a.ogg", "audio/ogg"],
    ["a.oga", "audio/ogg"],
    ["a.flac", "audio/flac"],
  ])("maps %s to %s", (name, mime) => {
    expect(extensionToMime(name)).toBe(mime);
  });

  it("ignores case", () => {
    expect(extensionToMime("PHOTO.JPG")).toBe("image/jpeg");
    expect(extensionToMime("Song.M4A")).toBe("audio/x-m4a");
  });

  it("returns null for unknown or missing extensions", () => {
    expect(extensionToMime("photo.heic")).toBeNull();
    expect(extensionToMime("noextension")).toBeNull();
    expect(extensionToMime("trailing.")).toBeNull();
    expect(extensionToMime(".png")).toBe("image/png");
  });

  it("uses the last extension", () => {
    expect(extensionToMime("archive.tar.png")).toBe("image/png");
  });
});

describe("contentTypeForMime", () => {
  it("classifies every allowed type", () => {
    for (const mime of UPLOAD_MIME_TYPES) {
      const expected = mime.startsWith("image/")
        ? "IMAGE"
        : mime.startsWith("video/")
          ? "VIDEO"
          : "AUDIO";
      expect(contentTypeForMime(mime)).toBe(expected);
    }
  });

  it("returns null for anything else", () => {
    expect(contentTypeForMime("image/heic")).toBeNull();
    expect(contentTypeForMime("application/pdf")).toBeNull();
    expect(contentTypeForMime("")).toBeNull();
  });
});

describe("sanitizeUploadName", () => {
  it("replaces unsafe characters and normalizes the extension", () => {
    expect(sanitizeUploadName("My Shot (1).PNG", "image/png")).toBe(
      "My-Shot--1-.png",
    );
  });

  it("uses the MIME's canonical extension", () => {
    expect(sanitizeUploadName("photo.jpeg", "image/jpeg")).toBe("photo.jpg");
    expect(sanitizeUploadName("clip.MOV", "video/quicktime")).toBe("clip.mov");
    expect(sanitizeUploadName("song.m4a", "audio/x-m4a")).toBe("song.m4a");
    expect(sanitizeUploadName("song.mp4", "audio/mp4")).toBe("song.m4a");
    expect(sanitizeUploadName("song.xyz", "audio/mpeg")).toBe("song.mp3");
    expect(sanitizeUploadName("loop.m4v", "video/mp4")).toBe("loop.mp4");
  });

  it("adds the extension to a name without one", () => {
    expect(sanitizeUploadName("holiday", "image/webp")).toBe("holiday.webp");
  });

  it("cuts the base to 120 characters before the extension", () => {
    const out = sanitizeUploadName(`${"a".repeat(200)}.png`, "image/png");
    expect(out).toBe(`${"a".repeat(120)}.png`);
  });

  it("falls back to file when nothing is left", () => {
    expect(sanitizeUploadName(".png", "image/png")).toBe("file.png");
    expect(sanitizeUploadName("", "image/png")).toBe("file.png");
  });

  it("neutralizes path separators and dots", () => {
    expect(sanitizeUploadName("../../etc/passwd.png", "image/png")).toBe(
      "..-..-etc-passwd.png",
    );
    expect(sanitizeUploadName("a\\b/c.png", "image/png")).toBe("a-b-c.png");
  });

  it("replaces non-ASCII characters", () => {
    expect(sanitizeUploadName("café ☕.png", "image/png")).toBe("caf---.png");
  });
});
