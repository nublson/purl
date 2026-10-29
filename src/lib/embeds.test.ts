import { describe, expect, it } from "vitest";
import { canEmbed, embedBoxRatio, embedSrc } from "./embeds";

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

describe("embedBoxRatio", () => {
  it("is 16:10 on screens wider than tall", () => {
    expect(embedBoxRatio({ width: 1440, height: 900 })).toBe("16 / 10");
  });

  it("is 3:4 on portrait (and square) screens", () => {
    expect(embedBoxRatio({ width: 390, height: 844 })).toBe("3 / 4");
    expect(embedBoxRatio({ width: 800, height: 800 })).toBe("3 / 4");
  });
});
