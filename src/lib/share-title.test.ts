import { describe, expect, it } from "vitest";
import { shareTitle } from "./share-title";

describe("shareTitle", () => {
  it("leads with Purl", () => {
    expect(shareTitle("MCP")).toBe("Purl | MCP");
    expect(shareTitle("🎨 Design by @nublson")).toBe(
      "Purl | 🎨 Design by @nublson",
    );
  });

  it("is just Purl without a title", () => {
    expect(shareTitle("  ")).toBe("Purl");
  });
});
