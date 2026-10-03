import { describe, expect, it } from "vitest";
import { isSameLinkUrl, omniboxSaveUrl } from "./omnibox";

describe("omniboxSaveUrl", () => {
  it.each([
    ["https://example.com/post", "https://example.com/post"],
    ["HTTP://Example.com", "http://example.com/"],
    ["example.com", "https://example.com/"],
    ["blog.dev/post?id=1", "https://blog.dev/post?id=1"],
    ["sub.domain.co.uk", "https://sub.domain.co.uk/"],
    ["  github.com  ", "https://github.com/"],
  ])("offers to save %j", (input, url) => {
    expect(omniboxSaveUrl(input)).toBe(url);
  });

  it.each([
    ["my blog post"],
    ["react"],
    ["notes.txt"],
    ["report.pdf"],
    ["1.5"],
    ["example.c0m"],
    ["https://"],
    ["https://nodot"],
    ["example .com"],
    [""],
  ])("treats %j as a search only", (input) => {
    expect(omniboxSaveUrl(input)).toBeNull();
  });
});

describe("isSameLinkUrl", () => {
  it("ignores scheme, www, trailing slash and host case", () => {
    expect(isSameLinkUrl("https://www.Example.com/post/", "http://example.com/post")).toBe(true);
    expect(isSameLinkUrl("https://example.com/a", "https://example.com/b")).toBe(false);
    expect(isSameLinkUrl("https://example.com/?q=1", "https://example.com/?q=2")).toBe(false);
  });
});
