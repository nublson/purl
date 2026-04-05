import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt, type RagContextChunk } from "./chat-prompt";
import { extractMentionLinkIds } from "./chat-utils";

describe("extractMentionLinkIds", () => {
  it("parses mention tokens and dedupes ids", () => {
    const text =
      'Summarize @[Article](abc) and @[Article](abc) plus @[Other](def)';
    expect(extractMentionLinkIds(text)).toEqual(["abc", "def"]);
  });

  it("returns empty array when no mentions", () => {
    expect(extractMentionLinkIds("Hello world")).toEqual([]);
  });
});

describe("buildChatSystemPrompt", () => {
  it("includes fallback instructions when there are no chunks", () => {
    const prompt = buildChatSystemPrompt([]);
    expect(prompt).toContain("no saved content was retrieved");
  });

  it("includes titles and content for chunks", () => {
    const chunks: RagContextChunk[] = [
      {
        linkId: "l1",
        linkTitle: "My Doc",
        linkUrl: "https://example.com",
        chunkIndex: 0,
        content: "Hello from chunk",
      },
    ];
    const prompt = buildChatSystemPrompt(chunks);
    expect(prompt).toContain("My Doc");
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("Hello from chunk");
  });
});
