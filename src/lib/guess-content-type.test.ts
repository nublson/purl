import { describe, expect, it } from "vitest";
import { guessContentType } from "./guess-content-type";

describe("guessContentType", () => {
  it("detects YouTube", () => {
    expect(guessContentType("https://www.youtube.com/watch?v=abc")).toBe(
      "YOUTUBE",
    );
    expect(guessContentType("https://youtu.be/abc")).toBe("YOUTUBE");
  });

  it("detects PDFs by extension, ignoring case and query", () => {
    expect(
      guessContentType("https://example.com/files/Report.PDF?download=1"),
    ).toBe("PDF");
  });

  it.each(["mp3", "m4a", "wav", "ogg", "flac", "aac"])(
    "detects .%s as audio",
    (ext) => {
      expect(guessContentType(`https://example.com/a.${ext}`)).toBe("AUDIO");
    },
  );

  it.each(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"])(
    "detects .%s as an image",
    (ext) => {
      expect(guessContentType(`https://x.test/a.${ext}`)).toBe("IMAGE");
    },
  );

  it.each(["mp4", "webm", "mov", "m4v"])("detects .%s as video", (ext) => {
    expect(guessContentType(`https://x.test/a.${ext}`)).toBe("VIDEO");
  });

  it("falls back to WEB", () => {
    expect(guessContentType("https://example.com/page")).toBe("WEB");
    expect(guessContentType("nonsense")).toBe("WEB");
  });
});
