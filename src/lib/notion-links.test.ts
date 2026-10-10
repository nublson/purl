import { describe, expect, it } from "vitest";
import {
  buildPageIdToPath,
  classifyNotionLink,
  notionPageIdFromUrl,
} from "./notion-links";

const map = buildPageIdToPath([
  { id: "244b1726-8ab3-83c3-9388-87a7a5748b73", slug: "privacy" },
  { id: "11111111-2222-3333-4444-555555555555", slug: "not-a-static-page" },
]);

describe("buildPageIdToPath", () => {
  it("maps dashless ids of static pages to their paths", () => {
    expect(map.get("244b17268ab383c3938887a7a5748b73")).toBe("/privacy");
    expect(map.size).toBe(1);
  });
});

describe("notionPageIdFromUrl", () => {
  it("reads the id from notion.so and notion.site urls", () => {
    expect(
      notionPageIdFromUrl(
        "https://www.notion.so/Privacy-244b17268ab383c3938887a7a5748b73?pvs=4",
      ),
    ).toBe("244b17268ab383c3938887a7a5748b73");
    expect(
      notionPageIdFromUrl(
        "https://nublson.notion.site/244b1726-8ab3-83c3-9388-87a7a5748b73",
      ),
    ).toBe("244b17268ab383c3938887a7a5748b73");
  });

  it("returns null for other hosts", () => {
    expect(
      notionPageIdFromUrl("https://example.com/244b17268ab383c3938887a7a5748b73"),
    ).toBeNull();
  });
});

describe("classifyNotionLink", () => {
  it("turns links to static pages into internal paths", () => {
    expect(
      classifyNotionLink(
        "https://www.notion.so/Privacy-244b17268ab383c3938887a7a5748b73",
        map,
      ),
    ).toEqual({ href: "/privacy", external: false });
  });

  it("renders links to unpublished notion pages as plain text", () => {
    const id = "99999999999999999999999999999999";
    expect(
      classifyNotionLink(`https://www.notion.so/Draft-${id}`, map),
    ).toBeNull();
    expect(classifyNotionLink(`https://team.notion.site/${id}`, map)).toBeNull();
    expect(classifyNotionLink(`/${id}`, map)).toBeNull();
  });

  it("maps root-relative notion page links to static pages", () => {
    const privacy = { href: "/privacy", external: false };
    expect(
      classifyNotionLink("/244b17268ab383c3938887a7a5748b73", map),
    ).toEqual(privacy);
    expect(
      classifyNotionLink("/Privacy-244b17268ab383c3938887a7a5748b73?pvs=4", map),
    ).toEqual(privacy);
    expect(
      classifyNotionLink("/244b1726-8ab3-83c3-9388-87a7a5748b73", map),
    ).toEqual(privacy);
  });

  it("keeps same-site links in the same tab", () => {
    expect(classifyNotionLink("/terms", map)).toEqual({
      href: "/terms",
      external: false,
    });
    expect(classifyNotionLink("#request", map)).toEqual({
      href: "#request",
      external: false,
    });
    expect(classifyNotionLink("https://purl.live/docs/api#auth", map)).toEqual({
      href: "/docs/api#auth",
      external: false,
    });
    expect(classifyNotionLink("https://dev.purl.live/privacy", map)).toEqual({
      href: "/privacy",
      external: false,
    });
  });

  it("opens other sites externally and keeps mailto in the tab", () => {
    expect(classifyNotionLink("https://github.com/nublson/purl", map)).toEqual({
      href: "https://github.com/nublson/purl",
      external: true,
    });
    expect(classifyNotionLink("mailto:hello@purl.live", map)).toEqual({
      href: "mailto:hello@purl.live",
      external: false,
    });
  });

  it("drops unsafe or empty links", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "https://purl.live//evil.example",
      "https://purl.live/\\evil.example",
      "",
      undefined,
      null,
    ]) {
      expect(classifyNotionLink(href, map)).toBeNull();
    }
  });
});
