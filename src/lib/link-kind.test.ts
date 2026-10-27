import { describe, expect, it } from "vitest";
import { cardAspectRatio, linkKind } from "./link-kind";

describe("linkKind", () => {
  it("maps content types to kinds", () => {
    expect(linkKind({ contentType: "IMAGE", embed: false })).toBe("image");
    expect(linkKind({ contentType: "VIDEO", embed: false })).toBe("video");
    expect(linkKind({ contentType: "AUDIO", embed: false })).toBe("audio");
    expect(linkKind({ contentType: "YOUTUBE", embed: false })).toBe("page");
    expect(linkKind({ contentType: "PDF", embed: false })).toBe("page");
    expect(linkKind({ contentType: "WEB", embed: false })).toBe("page");
  });

  it("embed wins over the content type", () => {
    expect(linkKind({ contentType: "WEB", embed: true })).toBe("embed");
    expect(linkKind({ contentType: "VIDEO", embed: true })).toBe("embed");
  });
});

describe("cardAspectRatio", () => {
  it("uses the media's own ratio", () => {
    expect(cardAspectRatio({ width: 800, height: 600 })).toBe("800 / 600");
  });

  it("clamps to between 1 / 3 and 3 / 1", () => {
    expect(cardAspectRatio({ width: 4000, height: 100 })).toBe("3 / 1");
    expect(cardAspectRatio({ width: 100, height: 4000 })).toBe("1 / 3");
  });

  it("falls back to 16 / 10", () => {
    expect(cardAspectRatio({ width: 0, height: 10 })).toBe("16 / 10");
    expect(cardAspectRatio({ width: 10, height: -1 })).toBe("16 / 10");
    expect(cardAspectRatio({ width: null, height: null })).toBe("16 / 10");
  });
});
