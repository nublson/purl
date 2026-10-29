import { describe, expect, it } from "vitest";
import { mediaTitleFromUrl, titleFromFileName } from "./media-title";

describe("titleFromFileName", () => {
  it("drops the extension", () => {
    expect(titleFromFileName("My Shot.png")).toBe("My Shot");
  });

  it("drops only the last extension", () => {
    expect(titleFromFileName("a.b.c.PNG")).toBe("a.b.c");
  });

  it("collapses whitespace", () => {
    expect(titleFromFileName("  My \t  Shot\n.png ")).toBe("My Shot");
  });

  it("drops control characters", () => {
    expect(titleFromFileName("Holiday\u0000 photo\u007f.PNG")).toBe(
      "Holiday photo",
    );
    expect(titleFromFileName("\u0000\u001f.png")).toBe("file");
  });

  it("falls back to 'file' when nothing is left", () => {
    expect(titleFromFileName(".png")).toBe("file");
    expect(titleFromFileName("")).toBe("file");
  });

  it("cuts to 500 characters", () => {
    expect(titleFromFileName(`${"a".repeat(600)}.png`)).toHaveLength(500);
  });
});

describe("mediaTitleFromUrl", () => {
  it("uses the decoded last path segment without its extension", () => {
    expect(
      mediaTitleFromUrl("https://cdn.test/img/My%20Shot.final.PNG", "cdn.test"),
    ).toBe("My Shot.final");
  });

  it("falls back to the domain when the path has no file name", () => {
    expect(mediaTitleFromUrl("https://cdn.test/", "cdn.test")).toBe("cdn.test");
    expect(mediaTitleFromUrl("https://cdn.test/img/", "cdn.test")).toBe(
      "cdn.test",
    );
  });

  it("falls back to the domain when the file name is only an extension", () => {
    expect(mediaTitleFromUrl("https://cdn.test/.png", "cdn.test")).toBe(
      "cdn.test",
    );
  });

  it("drops control characters, a decoded NUL included", () => {
    expect(mediaTitleFromUrl("https://x/a%00.png", "x")).toBe("a");
    expect(mediaTitleFromUrl("https://x/%00%1F.png", "x")).toBe("x");
  });

  it("ignores the query and hash", () => {
    expect(
      mediaTitleFromUrl("https://cdn.test/clip.mp4?t=10#start", "cdn.test"),
    ).toBe("clip");
  });

  it("keeps a malformed escape as written", () => {
    expect(mediaTitleFromUrl("https://cdn.test/100%25%.mp3", "cdn.test")).toBe(
      "100%25%",
    );
  });

  it("cuts to 500 characters", () => {
    expect(
      mediaTitleFromUrl(`https://cdn.test/${"a".repeat(600)}.mp3`, "cdn.test"),
    ).toHaveLength(500);
  });
});
