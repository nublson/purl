import { describe, expect, it } from "vitest";
import { buildAtomFeed, escapeXml } from "./atom-feed";
import type { PublicFolder, PublicLink, PublicOwner } from "./public-folders";

const owner: PublicOwner = { name: "Nubelson", image: null, username: "nublson" };
const folder: PublicFolder = {
  name: "Design",
  slug: "design",
  emoji: "🎨",
  description: "Things I like",
};

function link(over: Partial<PublicLink> = {}): PublicLink {
  return {
    id: "l1",
    url: "https://example.com/a?x=1&y=2",
    title: "Example",
    description: "About it",
    thumbnail: null,
    domain: "example.com",
    favicon: "",
    contentType: "WEB",
    createdAt: new Date("2026-10-02T10:00:00.000Z"),
    mimeType: null,
    width: null,
    height: null,
    duration: null,
    embed: false,
    upload: false,
    ...over,
  };
}

const origin = "https://purl.live";
const now = new Date("2026-10-13T00:00:00.000Z");

describe("buildAtomFeed", () => {
  it("writes the feed header and metadata", () => {
    const xml = buildAtomFeed({ origin, owner, folder, links: [link()], now });
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">',
      ),
    ).toBe(true);
    expect(xml).toContain("<title>🎨 Design by @nublson</title>");
    expect(xml).toContain("<subtitle>Things I like</subtitle>");
    expect(xml).toContain("<id>https://purl.live/@nublson/design</id>");
    expect(xml).toContain(
      '<link rel="self" type="application/atom+xml" href="https://purl.live/@nublson/design/feed.xml"/>',
    );
    expect(xml).toContain(
      '<link rel="alternate" type="text/html" href="https://purl.live/@nublson/design"/>',
    );
    expect(xml).toContain("<author><name>Nubelson</name></author>");
  });

  it("omits the subtitle without a description", () => {
    const xml = buildAtomFeed({
      origin,
      owner,
      folder: { ...folder, description: null },
      links: [],
      now,
    });
    expect(xml).not.toContain("<subtitle>");
  });

  it("uses the newest link for updated", () => {
    const xml = buildAtomFeed({
      origin,
      owner,
      folder,
      links: [
        link({ id: "l2", createdAt: new Date("2026-10-05T00:00:00.000Z") }),
        link(),
      ],
      now,
    });
    expect(xml).toContain("<updated>2026-10-05T00:00:00.000Z</updated>");
    expect(xml.indexOf("link:l2")).toBeLessThan(xml.indexOf("link:l1"));
  });

  it("uses now for an empty folder and has no entries", () => {
    const xml = buildAtomFeed({ origin, owner, folder, links: [], now });
    expect(xml).toContain("<updated>2026-10-13T00:00:00.000Z</updated>");
    expect(xml).not.toContain("<entry>");
  });

  it("writes entries", () => {
    const xml = buildAtomFeed({ origin, owner, folder, links: [link()], now });
    expect(xml).toContain("<id>tag:purl.live,2026:link:l1</id>");
    expect(xml).toContain("<title>Example</title>");
    expect(xml).toContain(
      '<link rel="alternate" href="https://example.com/a?x=1&amp;y=2"/>',
    );
    expect(xml).toContain("<published>2026-10-02T10:00:00.000Z</published>");
    expect(xml).toContain('<summary type="text">About it</summary>');
  });

  it("omits the summary without a description", () => {
    const xml = buildAtomFeed({
      origin,
      owner,
      folder,
      links: [link({ description: null })],
      now,
    });
    expect(xml).not.toContain("<summary");
  });

  it("falls back to the URL for an empty title", () => {
    const xml = buildAtomFeed({
      origin,
      owner,
      folder,
      links: [link({ title: "", url: "https://example.com/z" })],
      now,
    });
    expect(xml).toContain("<title>https://example.com/z</title>");
  });

  it.each([["whitespace-only", "   "], ["only forbidden characters", "\u0000"]])(
    "falls back to the URL for a %s title",
    (_name, title) => {
      const xml = buildAtomFeed({
        origin,
        owner,
        folder,
        links: [link({ title, url: "https://example.com/z" })],
        now,
      });
      expect(xml).toContain("<title>https://example.com/z</title>");
    },
  );

  it("escapes titles", () => {
    const xml = buildAtomFeed({
      origin,
      owner,
      folder,
      links: [link({ title: "Tom & Jerry ]]> <script>" })],
      now,
    });
    expect(xml).toContain("Tom &amp; Jerry ]]&gt; &lt;script&gt;");
    expect(xml).not.toContain("<script>");
  });

  it("tolerates a trailing slash on the origin", () => {
    const xml = buildAtomFeed({
      origin: "https://purl.live/",
      owner,
      folder,
      links: [],
      now,
    });
    expect(xml).toContain("<id>https://purl.live/@nublson/design</id>");
  });
});

describe("escapeXml", () => {
  it("escapes the five characters", () => {
    expect(escapeXml("a & b <c> \"d\" 'e'")).toBe(
      "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;",
    );
  });

  it("drops characters XML forbids", () => {
    expect(escapeXml("x\u0000y\u0008z\ud800w")).toBe("xyzw");
  });

  it("keeps emoji, tabs and newlines", () => {
    expect(escapeXml("🎨\t\n")).toBe("🎨\t\n");
  });
});
