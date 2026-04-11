import { describe, expect, it } from "vitest";
import { sanitizeChatMarkdownHref } from "./safe-markdown-href";

describe("sanitizeChatMarkdownHref", () => {
  it("accepts https and http absolute URLs", () => {
    expect(sanitizeChatMarkdownHref("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(sanitizeChatMarkdownHref("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
    expect(sanitizeChatMarkdownHref("http://localhost:3000/foo")).toBe(
      "http://localhost:3000/foo",
    );
  });

  it("accepts root-relative paths that are not protocol-relative", () => {
    expect(sanitizeChatMarkdownHref("/path")).toBe("/path");
    expect(sanitizeChatMarkdownHref("/path?x=1")).toBe("/path?x=1");
  });

  it("accepts fragment-only hrefs without whitespace or nested hash", () => {
    expect(sanitizeChatMarkdownHref("#intro")).toBe("#intro");
    expect(sanitizeChatMarkdownHref("#")).toBe("#");
  });

  it("rejects javascript, data, file, ftp, and other non-http(s) schemes", () => {
    expect(sanitizeChatMarkdownHref("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeChatMarkdownHref("data:text/html,<script>")).toBeUndefined();
    expect(sanitizeChatMarkdownHref("file:///etc/passwd")).toBeUndefined();
    expect(sanitizeChatMarkdownHref("ftp://example.com")).toBeUndefined();
    expect(sanitizeChatMarkdownHref("vbscript:msgbox")).toBeUndefined();
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeChatMarkdownHref("//evil.com/path")).toBeUndefined();
  });

  it("rejects empty, whitespace-only, and undefined", () => {
    expect(sanitizeChatMarkdownHref(undefined)).toBeUndefined();
    expect(sanitizeChatMarkdownHref("")).toBeUndefined();
    expect(sanitizeChatMarkdownHref("   ")).toBeUndefined();
  });

  it("rejects unparseable URLs", () => {
    expect(sanitizeChatMarkdownHref("not a url")).toBeUndefined();
  });

  it("rejects fragment hrefs with whitespace or second hash", () => {
    expect(sanitizeChatMarkdownHref("# bad")).toBeUndefined();
    expect(sanitizeChatMarkdownHref("#a#b")).toBeUndefined();
  });

  it("trims surrounding whitespace on valid inputs", () => {
    expect(sanitizeChatMarkdownHref("  /ok  ")).toBe("/ok");
    expect(sanitizeChatMarkdownHref("  #sec  ")).toBe("#sec");
  });
});
