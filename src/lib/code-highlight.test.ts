import { describe, expect, it } from "vitest";
import { highlightCode } from "./code-highlight";

describe("highlightCode", () => {
  it("returns a hast code element with light and dark token colours", async () => {
    const code = await highlightCode('{"a":1}', "json");
    expect(code.tagName).toBe("code");
    const json = JSON.stringify(code.children);
    expect(json).toContain("--shiki-light:");
    expect(json).toContain("--shiki-dark:");
  });

  it("highlights every supported language without throwing", async () => {
    for (const lang of [
      "bash", "json", "typescript", "javascript", "tsx", "http",
      "python", "yaml", "markdown", "diff", "toml",
    ] as const) {
      expect((await highlightCode("x", lang)).tagName).toBe("code");
    }
  });
});
