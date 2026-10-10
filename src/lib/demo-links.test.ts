import { describe, expect, it } from "vitest";

import { DEMO_LINKS_PER_FOLDER, DEMO_USERNAME, toDemoLinks, type DemoFolder } from "./demo-links";

const FOLDER: DemoFolder = {
  id: "f1",
  name: "Design",
  slug: "design",
  emoji: "🎨",
  description: null,
  linkCount: 1,
  links: [
    {
      id: "l1",
      url: "https://a.example",
      title: "A",
      description: "About A",
      thumbnail: null,
      domain: "a.example",
      favicon: "https://a.example/favicon.ico",
      contentType: "WEB",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ],
};

describe("demo constants", () => {
  it("uses the purl account and 20 links per folder", () => {
    expect(DEMO_USERNAME).toBe("purl");
    expect(DEMO_LINKS_PER_FOLDER).toBe(20);
  });
});

describe("toDemoLinks", () => {
  it("maps public links to app links, filed in the folder", () => {
    expect(toDemoLinks(FOLDER)).toEqual([
      { ...FOLDER.links[0], folderId: "f1" },
    ]);
  });

  it("returns an empty list for an empty folder", () => {
    expect(toDemoLinks({ ...FOLDER, links: [] })).toEqual([]);
  });
});
