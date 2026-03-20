import { describe, expect, it } from "vitest";
import { isPdfUrl } from "./pdf";

describe("isPdfUrl", () => {
  it("returns true for .pdf URLs over https/http", () => {
    expect(isPdfUrl("https://example.com/docs/file.pdf")).toBe(true);
    expect(isPdfUrl("http://example.com/file.pdf")).toBe(true);
  });

  it("returns true for uppercase .PDF extension", () => {
    expect(isPdfUrl("https://example.com/docs/file.PDF")).toBe(true);
  });

  it("returns false for non-PDF and invalid URLs", () => {
    expect(isPdfUrl("https://example.com/docs/file.txt")).toBe(false);
    expect(isPdfUrl("https://example.com")).toBe(false);
    expect(isPdfUrl("not a url")).toBe(false);
    expect(isPdfUrl("")).toBe(false);
  });
});
