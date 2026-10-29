import { describe, expect, it } from "vitest";
import { canEmbed, embedSrc } from "./embeds";

describe("canEmbed", () => {
  it("is true for WEB and YOUTUBE links", () => {
    expect(canEmbed({ contentType: "WEB", upload: false })).toBe(true);
    expect(canEmbed({ contentType: "YOUTUBE", upload: false })).toBe(true);
  });

  it("is false for media, PDFs and uploads", () => {
    for (const contentType of ["PDF", "IMAGE", "VIDEO", "AUDIO"] as const) {
      expect(canEmbed({ contentType, upload: false })).toBe(false);
    }
    expect(canEmbed({ contentType: "WEB", upload: true })).toBe(false);
  });
});

describe("embedSrc", () => {
  it("uses the no-cookie embed for YouTube", () => {
    expect(embedSrc({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("uses the page itself otherwise", () => {
    const url = "https://www.sanding.space/demos/search-expand";
    expect(embedSrc({ url })).toBe(url);
  });
});
