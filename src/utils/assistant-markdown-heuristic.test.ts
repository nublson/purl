import { describe, expect, it } from "vitest";
import { assistantContentLikelyUsesMarkdown } from "./assistant-markdown-heuristic";

describe("assistantContentLikelyUsesMarkdown", () => {
  it("returns false for empty or whitespace", () => {
    expect(assistantContentLikelyUsesMarkdown("")).toBe(false);
    expect(assistantContentLikelyUsesMarkdown("   \n")).toBe(false);
  });

  it("returns false for simple prose", () => {
    expect(assistantContentLikelyUsesMarkdown("Hello world.")).toBe(false);
    expect(
      assistantContentLikelyUsesMarkdown(
        "Here is a sentence with no special syntax.",
      ),
    ).toBe(false);
  });

  it("detects fenced code", () => {
    expect(assistantContentLikelyUsesMarkdown("```ts\nconst x = 1\n```")).toBe(
      true,
    );
  });

  it("detects inline code", () => {
    expect(assistantContentLikelyUsesMarkdown("Use the `foo` flag.")).toBe(
      true,
    );
  });

  it("detects markdown links", () => {
    expect(assistantContentLikelyUsesMarkdown("[a](https://x.com)")).toBe(true);
  });

  it("detects headings", () => {
    expect(assistantContentLikelyUsesMarkdown("# Title")).toBe(true);
    expect(assistantContentLikelyUsesMarkdown("Intro\n## Section")).toBe(true);
  });

  it("detects lists", () => {
    expect(assistantContentLikelyUsesMarkdown("- item")).toBe(true);
    expect(assistantContentLikelyUsesMarkdown("1. first")).toBe(true);
  });
});
