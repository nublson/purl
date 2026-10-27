import { describe, expect, it } from "vitest";
import { isVideoUrl } from "./video";

describe("isVideoUrl", () => {
  it("returns true for supported video file extensions", () => {
    for (const ext of ["mp4", "webm", "mov", "m4v"]) {
      expect(isVideoUrl(`https://example.com/a.${ext}`)).toBe(true);
    }
  });

  it("is case-insensitive and ignores the query string", () => {
    expect(isVideoUrl("https://x.test/clip.MOV")).toBe(true);
    expect(isVideoUrl("https://x.test/clip.mp4?t=3")).toBe(true);
  });

  it("returns false for non-video URLs", () => {
    expect(isVideoUrl("https://example.com/page")).toBe(false);
    expect(isVideoUrl("https://example.com/watch?file=a.mp4")).toBe(false);
    expect(isVideoUrl("https://example.com/a.png")).toBe(false);
    expect(isVideoUrl("not a url")).toBe(false);
    expect(isVideoUrl("")).toBe(false);
  });
});
