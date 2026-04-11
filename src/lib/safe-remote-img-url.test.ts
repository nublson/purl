import { describe, expect, it } from "vitest";
import { safeRemoteImgSrc } from "./safe-remote-img-url";

describe("safeRemoteImgSrc", () => {
  it("allows https and http", () => {
    expect(safeRemoteImgSrc("https://example.com/x.png")).toBe(
      "https://example.com/x.png",
    );
    expect(safeRemoteImgSrc("http://example.com/x.png")).toBe(
      "http://example.com/x.png",
    );
  });

  it("rejects non-http(s) schemes", () => {
    expect(safeRemoteImgSrc("javascript:alert(1)")).toBeNull();
    expect(safeRemoteImgSrc("data:text/html,hi")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(safeRemoteImgSrc("not a url")).toBeNull();
    expect(safeRemoteImgSrc("")).toBeNull();
  });
});
