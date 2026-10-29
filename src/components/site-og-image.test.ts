import { describe, expect, it } from "vitest";
import { siteOgHeadlineSize } from "./site-og-image";

describe("siteOgHeadlineSize", () => {
  it("uses the large size for short titles and static pages", () => {
    expect(siteOgHeadlineSize("Save your links", false)).toBe(64);
    expect(siteOgHeadlineSize("Save your links", true)).toBe(64);
  });

  it("steps down on the landing showcase when the headline is long", () => {
    const long = "Save the links you find — a calm home for your pearls";
    expect(long.length).toBeGreaterThan(28);
    expect(siteOgHeadlineSize(long, true)).toBe(52);
    expect(siteOgHeadlineSize(long, false)).toBe(64);
  });

  it("treats exactly 28 characters as still large on the showcase", () => {
    const title = "x".repeat(28);
    expect(siteOgHeadlineSize(title, true)).toBe(64);
    expect(siteOgHeadlineSize(`${title}x`, true)).toBe(52);
  });
});
