import { describe, expect, it } from "vitest";
import type { FolderSummary } from "@/lib/folders";
import type { ResourceLink } from "@/lib/links";
import {
  ALL_LINKS_NAME,
  ALL_LINKS_URI,
  FOLDER_URI_TEMPLATE,
  RESOURCE_NOT_FOUND,
  allLinksDescription,
  folderResourceDescription,
  folderResourceUri,
  renderAllLinksResource,
  renderFolderResource,
} from "./mcp-resources";

const NOW = new Date("2026-10-21T14:32:59Z");
const FOOTER_F1 =
  "_Snapshot from 2026-10-21 14:32 UTC. For the latest links, use list_saved_items with folderId f-1._\n";

function link(overrides: Partial<ResourceLink> = {}): ResourceLink {
  return {
    url: "https://example.com/a",
    title: "Title",
    description: null,
    domain: "example.com",
    contentType: "WEB",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    folder: null,
    ...overrides,
  };
}

function folder(overrides: Partial<FolderSummary> = {}): FolderSummary {
  return {
    id: "f-1",
    name: "Reading",
    slug: "reading",
    emoji: "📚",
    description: null,
    isPublic: false,
    position: 1,
    linkCount: 1,
    ...overrides,
  };
}

const bullet = (l: ResourceLink, f = folder()) =>
  renderFolderResource(f, [l], NOW).split("\n").filter((x) => x.startsWith("- "))[0];

describe("constants", () => {
  it("exposes the expected values", () => {
    expect(ALL_LINKS_URI).toBe("purl://links");
    expect(FOLDER_URI_TEMPLATE).toBe("purl://folders/{folderId}");
    expect(ALL_LINKS_NAME).toBe("🏠 All links");
    expect(RESOURCE_NOT_FOUND).toBe(-32002);
  });
});

describe("renderFolderResource", () => {
  it("renders a folder header with description", () => {
    const out = renderFolderResource(
      folder({ description: "Articles", linkCount: 2 }),
      [link(), link({ url: "https://example.com/b" })],
      NOW,
    );
    expect(
      out.startsWith("# 📚 Reading\n\nArticles\n\n2 links, newest first.\n\n## "),
    ).toBe(true);
  });

  it("renders a folder header without description", () => {
    const out = renderFolderResource(folder(), [link()], NOW);
    expect(out.startsWith("# 📚 Reading\n\n1 link, newest first.\n\n## ")).toBe(true);
  });

  it("counts the listed links, not folder.linkCount", () => {
    const out = renderFolderResource(
      folder({ linkCount: 5 }),
      [link(), link({ url: "https://example.com/b" })],
      NOW,
    );
    expect(out).toContain("\n\n2 links, newest first.\n\n");
  });

  it("renders an empty folder", () => {
    expect(renderFolderResource(folder({ linkCount: 0 }), [], NOW)).toBe(
      `# 📚 Reading\n\nNo links in this folder yet.\n\n${FOOTER_F1}`,
    );
    expect(
      renderFolderResource(folder({ linkCount: 0, description: "Articles" }), [], NOW),
    ).toBe(`# 📚 Reading\n\nArticles\n\nNo links in this folder yet.\n\n${FOOTER_F1}`);
  });

  it("renders empty All links", () => {
    expect(renderAllLinksResource([], NOW)).toBe(
      "# 🏠 All links\n\nNo links saved yet.\n\n_Snapshot from 2026-10-21 14:32 UTC. For the latest links, use list_saved_items._\n",
    );
  });

  it("ends with the snapshot footer", () => {
    expect(renderFolderResource(folder(), [link()], NOW).endsWith(`\n\n${FOOTER_F1}`)).toBe(
      true,
    );
    const out = renderFolderResource(
      folder(),
      [link()],
      new Date("2026-10-21T23:59:00-02:00"),
    );
    expect(out).toContain("_Snapshot from 2026-10-22 01:59 UTC.");
  });

  it("groups by UTC day", () => {
    const out = renderFolderResource(
      folder({ linkCount: 2 }),
      [
        link({ url: "https://x.com/new", createdAt: new Date("2026-10-20T00:30:00Z") }),
        link({ url: "https://x.com/old", createdAt: new Date("2026-10-19T23:30:00Z") }),
      ],
      NOW,
    );
    const a = out.indexOf("## 2026-10-20");
    const b = out.indexOf("## 2026-10-19");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(out.indexOf("x.com/new")).toBeLessThan(b);
    expect(out.indexOf("x.com/old")).toBeGreaterThan(b);
  });

  it("formats a bullet", () => {
    expect(bullet(link())).toBe("- [Title](https://example.com/a) · example.com");
    expect(bullet(link({ contentType: "PDF" }))).toBe(
      "- [Title](https://example.com/a) · example.com · PDF",
    );
    expect(bullet(link({ contentType: "YOUTUBE" }))).toMatch(/ · YouTube$/);
    expect(bullet(link({ contentType: "AUDIO" }))).toMatch(/ · Audio$/);
  });

  it("cuts descriptions", () => {
    const lineAfter = (d: string | null) => {
      const lines = renderFolderResource(folder(), [link({ description: d })], NOW).split("\n");
      const i = lines.findIndex((x) => x.startsWith("- "));
      return lines[i + 1];
    };
    expect(lineAfter("a".repeat(201))).toBe(`  ${"a".repeat(200)}…`);
    expect(lineAfter("a".repeat(200))).toBe(`  ${"a".repeat(200)}`);
    expect(lineAfter("a\n\n  b")).toBe("  a b");
    expect(lineAfter(null)).toBe("");
    expect(lineAfter("  \n ")).toBe("");
  });

  it("escapes titles", () => {
    expect(bullet(link({ title: "Foo]\n[bar\\" }))).toBe(
      "- [Foo\\] \\[bar\\\\](https://example.com/a) · example.com",
    );
  });

  it("falls back to the URL for a blank title", () => {
    expect(bullet(link({ title: "  " }))).toMatch(
      /^- \[https:\/\/example\.com\/a\]\(https:\/\/example\.com\/a\)/,
    );
    expect(bullet(link({ title: null as unknown as string }))).toMatch(
      /^- \[https:\/\/example\.com\/a\]\(/,
    );
  });

  it("wraps URLs with parentheses", () => {
    expect(bullet(link({ url: "https://en.wikipedia.org/wiki/Foo_(bar)" }))).toContain(
      "](<https://en.wikipedia.org/wiki/Foo_(bar)>)",
    );
  });

  it("omits a missing domain", () => {
    expect(bullet(link({ domain: "" }))).toBe("- [Title](https://example.com/a)");
    expect(bullet(link({ domain: " ", contentType: "PDF" }))).toBe(
      "- [Title](https://example.com/a) · PDF",
    );
  });

  it("never adds the folder suffix in a folder", () => {
    expect(bullet(link({ folder: { name: "Reading", emoji: "📚" } }))).toBe(
      "- [Title](https://example.com/a) · example.com",
    );
  });
});

describe("renderAllLinksResource", () => {
  it("adds the folder only for filed links", () => {
    const out = renderAllLinksResource(
      [
        link({ contentType: "PDF", folder: { name: "Reading", emoji: "📚" } }),
        link({ url: "https://example.com/b", title: "B" }),
      ],
      NOW,
    );
    expect(out).toContain("- [Title](https://example.com/a) · example.com · PDF · 📚 Reading\n");
    expect(out).toContain("- [B](https://example.com/b) · example.com\n");
    expect(out.startsWith("# 🏠 All links\n\n2 links, newest first.\n\n## ")).toBe(true);
  });
});

describe("descriptions and URIs", () => {
  it("describes resources", () => {
    expect(folderResourceDescription(folder({ description: "Articles", linkCount: 42 }))).toBe(
      "Articles · 42 links",
    );
    expect(folderResourceDescription(folder({ linkCount: 1 }))).toBe("1 link");
    expect(allLinksDescription(1)).toBe("Every link you've saved, newest first (1 link)");
    expect(folderResourceUri("abc")).toBe("purl://folders/abc");
  });
});
