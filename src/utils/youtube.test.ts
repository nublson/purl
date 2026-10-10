import { describe, expect, it } from "vitest";
import { getYouTubeEmbedUrl, isYouTubeUrl } from "./youtube";

describe("isYouTubeUrl", () => {
  describe("returns true for supported YouTube URL patterns", () => {
    it("accepts youtube.com/watch?v=", () => {
      expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts youtu.be short links", () => {
      expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts /shorts/ URLs", () => {
      expect(isYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts /live/ URLs", () => {
      expect(isYouTubeUrl("https://youtube.com/live/dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts m.youtube.com/watch?v=", () => {
      expect(isYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts m.youtube.com/shorts/", () => {
      expect(isYouTubeUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts youtube.com without www prefix on /watch", () => {
      expect(isYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    it("accepts youtu.be with a timestamp query param", () => {
      expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe(true);
    });
  });

  describe("returns false for invalid or unsupported patterns", () => {
    it("rejects non-YouTube domains", () => {
      expect(isYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    });

    it("rejects youtube.com homepage (no video path)", () => {
      expect(isYouTubeUrl("https://youtube.com")).toBe(false);
    });

    it("rejects /watch without a v param", () => {
      expect(isYouTubeUrl("https://youtube.com/watch")).toBe(false);
    });

    it("rejects /watch with an empty v param", () => {
      expect(isYouTubeUrl("https://youtube.com/watch?v=")).toBe(false);
    });

    it("rejects /shorts/ without an ID segment", () => {
      expect(isYouTubeUrl("https://youtube.com/shorts/")).toBe(false);
    });

    it("rejects /live/ without an ID segment", () => {
      expect(isYouTubeUrl("https://youtube.com/live/")).toBe(false);
    });

    it("rejects youtu.be with empty path", () => {
      expect(isYouTubeUrl("https://youtu.be/")).toBe(false);
    });

    it("rejects non-http(s) strings", () => {
      expect(isYouTubeUrl("not a url")).toBe(false);
    });

    it("rejects youtube.com channel pages", () => {
      expect(isYouTubeUrl("https://youtube.com/channel/UCdQw4w9WgXcQ")).toBe(false);
    });
  });
});

describe("getYouTubeEmbedUrl", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ])("embeds %s without cookies", (url) => {
    expect(getYouTubeEmbedUrl(url)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("returns null for other sites and invalid ids", () => {
    expect(getYouTubeEmbedUrl("https://vimeo.com/1")).toBeNull();
    expect(getYouTubeEmbedUrl("https://youtube.com/watch?v=<script>")).toBeNull();
  });
});
