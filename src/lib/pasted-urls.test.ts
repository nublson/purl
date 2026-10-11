import { describe, expect, it } from "vitest";
import { MAX_PASTED_URLS } from "./limits";
import { parsePastedUrls } from "./pasted-urls";

describe("parsePastedUrls", () => {
  it("splits a list of URLs on newlines", () => {
    const text = [
      "https://www.gustavofior.com/",
      "https://rauno.me/",
      "https://emilkowal.ski/",
    ].join("\n");

    expect(parsePastedUrls(text)).toEqual({
      urls: [
        "https://www.gustavofior.com/",
        "https://rauno.me/",
        "https://emilkowal.ski/",
      ],
      skipped: 0,
      tooMany: false,
    });
  });

  it("handles CRLF, tabs, blank lines and spaces", () => {
    const { urls } = parsePastedUrls(
      "https://a.com\r\n\r\nhttps://b.com\thttps://c.com   https://d.com\n",
    );
    expect(urls).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
      "https://d.com",
    ]);
  });

  it("drops a trailing comma or semicolon but keeps commas inside a URL", () => {
    const { urls } = parsePastedUrls(
      "https://a.com/x, https://www.google.com/maps/@40.7,-74.0,12z;",
    );
    expect(urls).toEqual([
      "https://a.com/x",
      "https://www.google.com/maps/@40.7,-74.0,12z",
    ]);
  });

  it("leaves a URL that wraps another URL whole", () => {
    const wrapped =
      "https://web.archive.org/web/2020/https://example.com/page";
    expect(parsePastedUrls(`${wrapped}\nhttps://b.com`).urls).toEqual([
      wrapped,
      "https://b.com",
    ]);
  });

  it("gives bare domains a scheme", () => {
    expect(parsePastedUrls("example.com\nhttps://b.com").urls).toEqual([
      "https://example.com/",
      "https://b.com",
    ]);
  });

  it("removes duplicates, ignoring www, a trailing slash and case", () => {
    const { urls } = parsePastedUrls(
      "https://www.a.com/\nhttps://a.com\nhttps://A.com/\nhttps://b.com",
    );
    expect(urls).toEqual(["https://www.a.com/", "https://b.com"]);
  });

  it("counts text that isn't a URL as skipped", () => {
    expect(
      parsePastedUrls("Reading list:\nhttps://a.com\nhttps://b.com\nthanks!"),
    ).toEqual({
      urls: ["https://a.com", "https://b.com"],
      skipped: 3,
      tooMany: false,
    });
  });

  it("returns no URLs for plain text", () => {
    expect(parsePastedUrls("just some words")).toEqual({
      urls: [],
      skipped: 3,
      tooMany: false,
    });
  });

  it("flags a paste over the cap", () => {
    const text = Array.from(
      { length: MAX_PASTED_URLS + 1 },
      (_, i) => `https://site${i}.com`,
    ).join("\n");
    const result = parsePastedUrls(text);
    expect(result.tooMany).toBe(true);
    expect(result.urls).toHaveLength(MAX_PASTED_URLS + 1);
  });

  it("is fine exactly at the cap", () => {
    const text = Array.from(
      { length: MAX_PASTED_URLS },
      (_, i) => `https://site${i}.com`,
    ).join("\n");
    expect(parsePastedUrls(text).tooMany).toBe(false);
  });
});
