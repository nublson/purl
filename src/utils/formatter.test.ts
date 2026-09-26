import { describe, expect, it } from "vitest";
import { formatDomain, getDateGroupLabel, getUrlDomain } from "./formatter";

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

describe("getDateGroupLabel", () => {
  const now = new Date("2026-09-26T12:00:00Z"); // Saturday
  const label = (iso: string, tz = "UTC", n = now) =>
    getDateGroupLabel(new Date(iso), n, tz);

  it("Today / Yesterday", () => {
    expect(label("2026-09-26T00:00:00Z")).toBe("Today");
    expect(label("2026-09-25T23:59:59Z")).toBe("Yesterday");
  });

  it("future instant is Today", () =>
    expect(label("2026-09-26T12:05:00Z")).toBe("Today"));

  it("This week starts Monday", () => {
    expect(label("2026-09-21T00:00:00Z")).toBe("This week"); // Monday
    expect(label("2026-09-20T23:59:59Z")).toBe("Last week"); // Sunday before
    expect(label("2026-09-14T00:00:00Z")).toBe("Last week"); // previous Monday
    expect(label("2026-09-13T23:59:59Z")).toBe("September");
  });

  it("now on Sunday: This week vs Last week boundary", () => {
    const sun = new Date("2026-09-27T12:00:00Z");
    expect(label("2026-09-21T00:00:00Z", "UTC", sun)).toBe("This week"); // Monday
    expect(label("2026-09-20T23:59:59Z", "UTC", sun)).toBe("Last week"); // Sunday before
  });

  it("no This week on Monday or Tuesday", () => {
    const tue = new Date("2026-09-22T12:00:00Z");
    expect(label("2026-09-21T09:00:00Z", "UTC", tue)).toBe("Yesterday");
    expect(label("2026-09-20T09:00:00Z", "UTC", tue)).toBe("Last week");
  });

  it("months in the current year, month + year before", () => {
    expect(label("2026-01-01T00:00:00Z")).toBe("January");
    expect(label("2025-12-31T23:59:59Z")).toBe("December 2025");
  });

  it("week spanning a year boundary", () => {
    const fri = new Date("2026-01-02T12:00:00Z");
    expect(label("2025-12-29T09:00:00Z", "UTC", fri)).toBe("This week");
    expect(label("2025-12-24T09:00:00Z", "UTC", fri)).toBe("Last week");
    expect(label("2025-12-20T09:00:00Z", "UTC", fri)).toBe("December 2025");
  });

  it("uses the given zone", () => {
    expect(label("2026-09-26T01:00:00Z", "UTC")).toBe("Today");
    expect(label("2026-09-26T01:00:00Z", "America/Sao_Paulo")).toBe(
      "Yesterday",
    );
    const lisbonNow = new Date("2026-09-26T23:30:00Z"); // 00:30 on the 27th in Lisbon (UTC+1)
    expect(label("2026-09-26T22:00:00Z", "Europe/Lisbon", lisbonNow)).toBe(
      "Yesterday",
    );
    expect(label("2026-09-26T22:00:00Z", "UTC", lisbonNow)).toBe("Today");
  });

  it("DST switch does not shift days", () => {
    // Europe/Lisbon springs forward 2026-03-29 01:00Z; now = Mon 2026-03-30 10:00Z
    const mon = new Date("2026-03-30T10:00:00Z");
    expect(label("2026-03-29T00:30:00Z", "Europe/Lisbon", mon)).toBe(
      "Yesterday",
    );
    expect(label("2026-03-28T23:30:00Z", "Europe/Lisbon", mon)).toBe(
      "Last week",
    );
  });
});
