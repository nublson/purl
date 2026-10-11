import { describe, expect, it } from "vitest";
import { cleanImportItems, flattenFolderPath } from "./normalize";
import type { ImportItem } from "./types";

const now = new Date("2026-10-11T12:00:00Z");

function item(url: string, over: Partial<ImportItem> = {}): ImportItem {
  return { url, title: "t", folder: null, createdAt: null, ...over };
}

describe("flattenFolderPath", () => {
  it("joins segments with a slash", () => {
    expect(flattenFolderPath(["Dev", "Tools"])).toBe("Dev / Tools");
  });

  it("trims segments", () => {
    expect(flattenFolderPath([" Dev "])).toBe("Dev");
  });

  it("returns null when nothing is left", () => {
    expect(flattenFolderPath(["", " "])).toBeNull();
  });

  it("falls back to the last segment when the path is too long", () => {
    const long = "a".repeat(58);
    expect(flattenFolderPath([long, "Last"])).toBe("Last");
  });

  it("truncates a long last segment with an ellipsis, never splitting an emoji", () => {
    const name = "a".repeat(58) + "😀😀😀";
    const out = flattenFolderPath([name])!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false);
    expect(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });
});

describe("cleanImportItems", () => {
  it("drops unsupported URLs and keeps http(s)", () => {
    const result = cleanImportItems(
      [
        item("javascript:alert(1)"),
        item("chrome://settings"),
        item("file:///x"),
        item("about:blank"),
        item("not a url"),
        item("http://a.com/"),
        item("https://b.com/"),
      ],
      now,
    );
    expect(result.skipped).toBe(5);
    expect(result.items.map((i) => i.url)).toEqual([
      "http://a.com/",
      "https://b.com/",
    ]);
  });

  it("sorts newest first, null dates as now, stable on ties", () => {
    const result = cleanImportItems(
      [
        item("https://old.com/", { createdAt: new Date("2020-01-01") }),
        item("https://tie1.com/"),
        item("https://newer.com/", { createdAt: new Date("2025-01-01") }),
        item("https://tie2.com/"),
      ],
      now,
    );
    expect(result.items.map((i) => i.url)).toEqual([
      "https://tie1.com/",
      "https://tie2.com/",
      "https://newer.com/",
      "https://old.com/",
    ]);
  });

  it("collapses duplicates by URL key, keeping the first after sorting", () => {
    const result = cleanImportItems(
      [
        item("http://www.a.com/x/", {
          title: "old",
          createdAt: new Date("2020-01-01"),
        }),
        item("https://a.com/x", {
          title: "new",
          createdAt: new Date("2024-01-01"),
        }),
      ],
      now,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("new");
    expect(result.skipped).toBe(0);
  });

  it("nulls implausible dates", () => {
    const result = cleanImportItems(
      [
        item("https://a.com/", { createdAt: new Date("1999-12-31") }),
        item("https://b.com/", { createdAt: new Date("2027-01-01") }),
        item("https://c.com/", { createdAt: new Date("2024-05-05") }),
      ],
      now,
    );
    const byUrl = Object.fromEntries(result.items.map((i) => [i.url, i.createdAt]));
    expect(byUrl["https://a.com/"]).toBeNull();
    expect(byUrl["https://b.com/"]).toBeNull();
    expect(byUrl["https://c.com/"]).toEqual(new Date("2024-05-05"));
  });

  it("trims titles", () => {
    const result = cleanImportItems([item("https://a.com/", { title: "  Hi  " })], now);
    expect(result.items[0].title).toBe("Hi");
  });
});
