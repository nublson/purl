import { describe, expect, it } from "vitest";
import { HIGHLIGHT_LANGUAGES } from "./code-languages";
import { highlightCode } from "./code-highlight";

describe("highlightCode", () => {
  it("returns a hast code element with light and dark token colours", async () => {
    const code = await highlightCode('{"a":1}', "json");
    expect(code.tagName).toBe("code");
    const json = JSON.stringify(code.children);
    expect(json).toContain("--shiki-light:");
    expect(json).toContain("--shiki-dark:");
  });

  it.each([...HIGHLIGHT_LANGUAGES])("highlights %s", async (lang) => {
    const code = await highlightCode("x", lang);
    expect(code.tagName).toBe("code");
    expect(JSON.stringify(code.children)).toContain("--shiki-light:");
  });
});
