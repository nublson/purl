import { describe, expect, it } from "vitest";
import { isImageUrl } from "./image";

describe("isImageUrl", () => {
  it("returns true for supported image file extensions", () => {
    for (const ext of ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]) {
      expect(isImageUrl(`https://example.com/a.${ext}`)).toBe(true);
    }
  });

  it("is case-insensitive and ignores the query string", () => {
    expect(isImageUrl("https://x.test/a.PNG")).toBe(true);
    expect(isImageUrl("https://x.test/a.jpg?w=200")).toBe(true);
  });

  it("returns false for non-image URLs", () => {
    expect(isImageUrl("https://example.com/page")).toBe(false);
    expect(isImageUrl("https://example.com/viewer?file=a.png")).toBe(false);
    expect(isImageUrl("https://example.com/clip.mp4")).toBe(false);
    expect(isImageUrl("not a url")).toBe(false);
    expect(isImageUrl("")).toBe(false);
  });
});
