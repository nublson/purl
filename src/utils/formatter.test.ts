import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDomain,
  getRelativeDateLabel,
  getUrlDomain,
} from "./formatter";

describe("formatDomain", () => {
  it("strips subdomains", () => {
    expect(formatDomain("cdn.prod.website-files.com")).toBe("website-files.com");
  });

  it("strips www. prefix", () => {
    expect(formatDomain("www.example.com")).toBe("example.com");
  });

  it("leaves bare domains unchanged", () => {
    expect(formatDomain("github.com")).toBe("github.com");
    expect(formatDomain("claude.com")).toBe("claude.com");
  });

  it("handles multi-part public suffixes", () => {
    expect(formatDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
  });

  it("normalizes uppercase hostnames and strips www", () => {
    expect(formatDomain("WWW.EXAMPLE.COM")).toBe("example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(formatDomain("  www.example.com  ")).toBe("example.com");
  });

  it("returns a hostname without dots unchanged aside from www stripping", () => {
    expect(formatDomain("localhost")).toBe("localhost");
  });

  it("returns a two-label domain as-is", () => {
    expect(formatDomain("sub.example.com")).toBe("example.com");
    expect(formatDomain("news.ycombinator.com")).toBe("ycombinator.com");
  });
});

describe("getUrlDomain", () => {
  it("strips www. prefix", () => {
    expect(getUrlDomain("https://www.example.com/path")).toBe("example.com");
  });

  it("strips nested subdomains", () => {
    expect(
      getUrlDomain("https://cdn.prod.website-files.com/some/path"),
    ).toBe("website-files.com");
  });

  it("leaves non-www hostnames unchanged", () => {
    expect(getUrlDomain("https://example.com/path")).toBe("example.com");
  });

  it("handles invalid URLs by returning the input", () => {
    expect(getUrlDomain("not-a-url")).toBe("not-a-url");
  });
});

describe("getRelativeDateLabel", () => {
  const fixedNow = new Date(2025, 5, 15); // 2025-06-15

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Today for same day", () => {
    expect(getRelativeDateLabel(new Date(2025, 5, 15))).toBe("Today");
  });

  it("returns This Week for 1-7 days ago", () => {
    expect(getRelativeDateLabel(new Date(2025, 5, 12))).toBe("This Week"); // 3 days ago
  });

  it("returns Last Week for 8-14 days ago", () => {
    expect(getRelativeDateLabel(new Date(2025, 5, 5))).toBe("Last Week"); // 10 days ago
  });

  it("returns This Month for 15-31 days ago", () => {
    expect(getRelativeDateLabel(new Date(2025, 4, 26))).toBe("This Month"); // 20 days ago
  });

  it("returns Last Month for dates in previous calendar month", () => {
    expect(getRelativeDateLabel(new Date(2025, 4, 10))).toBe("Last Month"); // May 10
  });

  it("returns This Year for earlier same year", () => {
    expect(getRelativeDateLabel(new Date(2025, 0, 20))).toBe("This Year"); // Jan 20
  });

  it("returns Last Year for previous year", () => {
    expect(getRelativeDateLabel(new Date(2024, 8, 1))).toBe("Last Year");
  });

  it("returns Older for 2+ years ago", () => {
    expect(getRelativeDateLabel(new Date(2023, 0, 1))).toBe("Older");
  });
});
