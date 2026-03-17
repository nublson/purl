import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRelativeDateLabel, getUrlDomain } from "./formatter";

describe("getUrlDomain", () => {
  it("strips www. prefix", () => {
    expect(getUrlDomain("https://www.example.com/path")).toBe("example.com");
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
