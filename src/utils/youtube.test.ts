import { describe, expect, it } from "vitest";
import { isYouTubeUrl } from "./youtube";

describe("isYouTubeUrl", () => {
  it("returns true for supported YouTube URL patterns", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      true,
    );
    expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeUrl("https://youtube.com/live/dQw4w9WgXcQ")).toBe(true);
  });

  it("returns false for non-YouTube URLs", () => {
    expect(isYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(isYouTubeUrl("https://youtube.com")).toBe(false);
    expect(isYouTubeUrl("not a url")).toBe(false);
  });
});
