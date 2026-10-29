import { describe, expect, it } from "vitest";
import { buildPageIdToPath, sameSiteLink } from "./notion-links";

describe("buildPageIdToPath", () => {
  it("maps dashless ids of static pages to their paths", () => {
    const map = buildPageIdToPath([
      { id: "244b1726-8ab3-83c3-9388-87a7a5748b73", slug: "privacy" },
      { id: "11111111-2222-3333-4444-555555555555", slug: "not-a-static-page" },
    ]);
    expect(map.get("244b17268ab383c3938887a7a5748b73")).toBe("/privacy");
    expect(map.size).toBe(1);
  });
});

describe("sameSiteLink", () => {
  it("turns purl.live and its subdomains into same-tab paths", () => {
    expect(sameSiteLink({ href: "https://purl.live/docs/api?x=1#auth", external: true })).toEqual({
      href: "/docs/api?x=1#auth",
      external: false,
    });
    expect(sameSiteLink({ href: "https://dev.purl.live/privacy", external: true })).toEqual({
      href: "/privacy",
      external: false,
    });
  });

  it("leaves other sites, look-alikes and internal links alone", () => {
    for (const link of [
      { href: "https://example.com/", external: true },
      { href: "https://notpurl.live/", external: true },
      { href: "https://purl.live.evil.com/", external: true },
      { href: "/terms", external: false },
      { href: "mailto:a@b.c", external: false },
    ]) {
      expect(sameSiteLink(link)).toEqual(link);
    }
  });

  it("never turns a URL into a protocol-relative path", () => {
    const link = { href: "https://purl.live//evil.com", external: true };
    expect(sameSiteLink(link)).toEqual(link);
  });
});
