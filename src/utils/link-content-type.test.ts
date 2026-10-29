import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectContentType } from "./link-content-type";

function createHeadResponse(contentType: string): Response {
  return new Response(null, {
    headers: { "content-type": contentType },
  });
}

describe("detectContentType", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(createHeadResponse("text/html; charset=utf-8")),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("YOUTUBE", () => {
    it("returns YOUTUBE for youtube.com/watch?v=", async () => {
      expect(
        await detectContentType("https://www.youtube.com/watch?v=abc123"),
      ).toMatchObject({ contentType: "YOUTUBE" });
    });

    it("returns YOUTUBE for youtu.be short links", async () => {
      expect(
        await detectContentType("https://youtu.be/dQw4w9WgXcQ"),
      ).toMatchObject({ contentType: "YOUTUBE" });
    });

    it("returns YOUTUBE for youtube.com/shorts/", async () => {
      expect(
        await detectContentType("https://www.youtube.com/shorts/abc123"),
      ).toMatchObject({ contentType: "YOUTUBE" });
    });

    it("returns YOUTUBE for youtube.com/live/", async () => {
      expect(
        await detectContentType("https://www.youtube.com/live/abc123"),
      ).toMatchObject({ contentType: "YOUTUBE" });
    });

    it("YOUTUBE takes precedence over PDF in edge-case URL", async () => {
      // YouTube URLs never end with .pdf, but the priority order is YOUTUBE > PDF
      expect(
        await detectContentType("https://www.youtube.com/watch?v=abc123"),
      ).toMatchObject({ contentType: "YOUTUBE" });
    });
  });

  describe("PDF", () => {
    it("returns PDF for a .pdf URL", async () => {
      expect(
        await detectContentType("https://example.com/doc.pdf"),
      ).toMatchObject({ contentType: "PDF" });
    });

    it("returns PDF for an uppercase .PDF URL", async () => {
      expect(
        await detectContentType("https://example.com/REPORT.PDF"),
      ).toMatchObject({ contentType: "PDF" });
    });

    it("does not return PDF when .pdf appears only in a query parameter", async () => {
      expect(
        await detectContentType("https://example.com/viewer?file=report.pdf"),
      ).toMatchObject({ contentType: "WEB" });
    });
  });

  describe("AUDIO", () => {
    it("returns AUDIO for an .mp3 URL", async () => {
      expect(
        await detectContentType("https://example.com/podcast.mp3"),
      ).toMatchObject({ contentType: "AUDIO" });
    });

    it("returns AUDIO for a .m4a URL", async () => {
      expect(
        await detectContentType("https://cdn.example.com/ep1.m4a"),
      ).toMatchObject({ contentType: "AUDIO" });
    });

    it("returns AUDIO for a .wav URL", async () => {
      expect(
        await detectContentType("https://example.com/sample.wav"),
      ).toMatchObject({ contentType: "AUDIO" });
    });

    it("returns AUDIO for an .ogg URL", async () => {
      expect(
        await detectContentType("https://example.com/track.ogg"),
      ).toMatchObject({ contentType: "AUDIO" });
    });
  });

  describe("IMAGE and VIDEO", () => {
    it("returns IMAGE for an uppercase .PNG URL without a request", async () => {
      expect(await detectContentType("https://x.test/a.PNG")).toEqual({
        contentType: "IMAGE",
        mimeType: null,
      });
    });

    it("returns VIDEO for a .mov URL without a request", async () => {
      expect(await detectContentType("https://x.test/clip.mov")).toEqual({
        contentType: "VIDEO",
        mimeType: null,
      });
    });
  });

  describe("WEB (fallback)", () => {
    it("returns WEB for a regular https page", async () => {
      expect(
        await detectContentType("https://example.com/article"),
      ).toMatchObject({ contentType: "WEB" });
    });

    it("returns WEB for a Spotify URL (audio platform URL)", async () => {
      expect(
        await detectContentType("https://open.spotify.com/track/abc"),
      ).toMatchObject({ contentType: "WEB" });
    });

    it("returns WEB when URL has no extension", async () => {
      expect(
        await detectContentType("https://news.ycombinator.com"),
      ).toMatchObject({ contentType: "WEB" });
    });

    it("returns WEB for an SPA-heavy social URL", async () => {
      expect(
        await detectContentType("https://x.com/user/status/123"),
      ).toMatchObject({ contentType: "WEB" });
    });
  });

  describe("HEAD sniff fallback", () => {
    it("returns PDF when content-type is application/pdf without .pdf extension", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(createHeadResponse("application/pdf")),
      );
      expect(
        await detectContentType("https://example.com/pdf/123"),
      ).toMatchObject({ contentType: "PDF" });
    });

    it("returns AUDIO when content-type is audio/* without audio extension", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(createHeadResponse("audio/mpeg")),
      );
      expect(
        await detectContentType("https://cdn.example.com/stream?id=1"),
      ).toMatchObject({ contentType: "AUDIO" });
    });

    it("returns WEB when content-type is text/html", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(createHeadResponse("text/html")),
      );
      expect(
        await detectContentType("https://example.com/no-ext"),
      ).toMatchObject({ contentType: "WEB" });
    });

    it("returns WEB when HEAD request fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network down")),
      );
      expect(
        await detectContentType("https://example.com/no-ext"),
      ).toMatchObject({ contentType: "WEB" });
    });

    it("returns WEB when HEAD request times out", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("The operation was aborted")),
      );
      expect(
        await detectContentType("https://example.com/no-ext"),
      ).toMatchObject({ contentType: "WEB" });
    });
  });
});
