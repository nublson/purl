import { describe, expect, it } from "vitest";
import { codeLanguageLabel, normalizeLanguage } from "./code-languages";

describe("normalizeLanguage", () => {
  it.each([
    ["Shell", "bash"],
    ["sh", "bash"],
    ["zsh", "bash"],
    ["bash", "bash"],
    ["JavaScript", "javascript"],
    ["js", "javascript"],
    ["TypeScript", "typescript"],
    ["ts", "typescript"],
    ["JSON", "json"],
    ["yml", "yaml"],
    ["md", "markdown"],
    ["py", "python"],
  ])("maps %s to %s", (label, expected) => {
    expect(normalizeLanguage(label)).toBe(expected);
  });

  it("returns null for plain text and unsupported languages", () => {
    expect(normalizeLanguage("Plain Text")).toBeNull();
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage("Swift")).toBeNull();
  });
});

describe("codeLanguageLabel", () => {
  it("shows Plain text for empty or plain labels", () => {
    expect(codeLanguageLabel("Plain Text")).toBe("Plain text");
    expect(codeLanguageLabel(null)).toBe("Plain text");
  });

  it("keeps Notion's label otherwise", () => {
    expect(codeLanguageLabel("JSON")).toBe("JSON");
  });
});
