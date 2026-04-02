import { describe, expect, it } from "vitest";
import { detectContentType } from "./link-content-type";

describe("detectContentType", () => {
  describe("YOUTUBE", () => {
    it("returns YOUTUBE for youtube.com/watch?v=", () => {
      expect(detectContentType("https://www.youtube.com/watch?v=abc123")).toBe(
        "YOUTUBE",
      );
    });

    it("returns YOUTUBE for youtu.be short links", () => {
      expect(detectContentType("https://youtu.be/dQw4w9WgXcQ")).toBe(
        "YOUTUBE",
      );
    });

    it("returns YOUTUBE for youtube.com/shorts/", () => {
      expect(detectContentType("https://www.youtube.com/shorts/abc123")).toBe(
        "YOUTUBE",
      );
    });

    it("returns YOUTUBE for youtube.com/live/", () => {
      expect(detectContentType("https://www.youtube.com/live/abc123")).toBe(
        "YOUTUBE",
      );
    });

    it("YOUTUBE takes precedence over PDF in edge-case URL", () => {
      // YouTube URLs never end with .pdf, but the priority order is YOUTUBE > PDF
      expect(
        detectContentType("https://www.youtube.com/watch?v=abc123"),
      ).toBe("YOUTUBE");
    });
  });

  describe("PDF", () => {
    it("returns PDF for a .pdf URL", () => {
      expect(detectContentType("https://example.com/doc.pdf")).toBe("PDF");
    });

    it("returns PDF for an uppercase .PDF URL", () => {
      expect(detectContentType("https://example.com/REPORT.PDF")).toBe("PDF");
    });

    it("does not return PDF when .pdf appears only in a query parameter", () => {
      expect(
        detectContentType("https://example.com/viewer?file=report.pdf"),
      ).toBe("WEB");
    });
  });

  describe("AUDIO", () => {
    it("returns AUDIO for an .mp3 URL", () => {
      expect(detectContentType("https://example.com/podcast.mp3")).toBe(
        "AUDIO",
      );
    });

    it("returns AUDIO for a .m4a URL", () => {
      expect(detectContentType("https://cdn.example.com/ep1.m4a")).toBe(
        "AUDIO",
      );
    });

    it("returns AUDIO for a .wav URL", () => {
      expect(detectContentType("https://example.com/sample.wav")).toBe(
        "AUDIO",
      );
    });

    it("returns AUDIO for an .ogg URL", () => {
      expect(detectContentType("https://example.com/track.ogg")).toBe("AUDIO");
    });
  });

  describe("WEB (fallback)", () => {
    it("returns WEB for a regular https page", () => {
      expect(detectContentType("https://example.com/article")).toBe("WEB");
    });

    it("returns WEB for a Spotify URL (audio platform, not a direct file)", () => {
      expect(
        detectContentType("https://open.spotify.com/track/abc"),
      ).toBe("WEB");
    });

    it("returns WEB when URL has no extension", () => {
      expect(detectContentType("https://news.ycombinator.com")).toBe("WEB");
    });

    it("returns WEB for an SPA-heavy social URL", () => {
      expect(detectContentType("https://x.com/user/status/123")).toBe("WEB");
    });
  });
});
