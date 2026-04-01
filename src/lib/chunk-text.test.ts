import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk-text";

describe("chunkText", () => {
  it("returns empty array for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("normalizes whitespace and returns a single chunk for short content", () => {
    expect(chunkText("hello   world\n\nfrom\tpurl")).toEqual([
      "hello world from purl",
    ]);
  });

  it("splits long content into overlapping chunks", () => {
    const text =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
    const chunks = chunkText(text, { chunkSize: 24, chunkOverlap: 6 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toBe("alpha beta gamma delta");
    expect(chunks[1]).toContain("delta");
  });

  it("throws when overlap is greater than or equal to chunk size", () => {
    expect(() => chunkText("abc", { chunkSize: 10, chunkOverlap: 10 })).toThrow(
      "chunkOverlap must be smaller than chunkSize.",
    );
  });
});
