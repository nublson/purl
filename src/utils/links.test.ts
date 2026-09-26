import { describe, expect, it } from "vitest";
import {
  countGroupedLinks,
  groupLinksByDate,
  mergeLinkGroups,
  parseJsonLinkGroups,
  type Link,
} from "./links";

function link(createdAt: Date, title: string): Link {
  return {
    id: `id-${title}`,
    favicon: "",
    title,
    url: "https://example.com",
    domain: "example.com",
    contentType: "WEB",
    description: null,
    thumbnail: null,
    createdAt,
  };
}

describe("groupLinksByDate", () => {
  const opts = { now: new Date("2026-09-26T12:00:00Z"), timeZone: "UTC" };

  it("groups links under chronological labels", () => {
    const today = new Date("2026-09-26T09:00:00Z");
    const yesterday = new Date("2026-09-25T09:00:00Z");
    const thisWeek = new Date("2026-09-22T09:00:00Z");
    const lastWeek = new Date("2026-09-15T09:00:00Z");
    const august = new Date("2026-08-10T09:00:00Z");
    const december2025 = new Date("2025-12-01T09:00:00Z");
    const links: Link[] = [
      link(august, "august"),
      link(today, "today"),
      link(december2025, "december2025"),
      link(lastWeek, "lastWeek"),
      link(yesterday, "yesterday"),
      link(thisWeek, "thisWeek"),
    ];
    const groups = groupLinksByDate(links, opts);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "Last week",
      "August",
      "December 2025",
    ]);
  });

  it("sorts newest-first within a group", () => {
    const today1 = new Date("2026-09-26T10:00:00Z");
    const today2 = new Date("2026-09-26T12:00:00Z");
    const links: Link[] = [link(today1, "first"), link(today2, "second")];
    const groups = groupLinksByDate(links, opts);
    expect(groups[0].links.map((l) => l.title)).toEqual(["second", "first"]);
  });

  it("returns [] for no links", () => {
    expect(groupLinksByDate([], opts)).toEqual([]);
  });
});

describe("mergeLinkGroups", () => {
  const d = new Date("2026-09-26T09:00:00Z");

  it("joins a label split across pages", () => {
    const a = link(d, "a");
    const b = link(d, "b");
    const c = link(d, "c");
    const merged = mergeLinkGroups(
      [{ label: "August", links: [a] }],
      [
        { label: "August", links: [b] },
        { label: "July", links: [c] },
      ],
    );
    expect(merged).toEqual([
      { label: "August", links: [a, b] },
      { label: "July", links: [c] },
    ]);
  });

  it("drops duplicates", () => {
    const a = link(d, "a");
    const b = link(d, "b");
    const c = link(d, "c");
    const merged = mergeLinkGroups(
      [{ label: "Today", links: [a, b] }],
      [
        { label: "Today", links: [b, c] },
        { label: "Older", links: [link(d, "z")] },
      ],
    );
    expect(merged.map((g) => g.label)).toEqual(["Today", "Older"]);
    expect(merged[0].links.map((l) => l.title)).toEqual(["a", "b", "c"]);
    expect(countGroupedLinks(merged)).toBe(4);
  });

  it("with an empty page returns groups unchanged", () => {
    const groups = [{ label: "Today", links: [link(d, "a")] }];
    expect(mergeLinkGroups(groups, [])).toEqual(groups);
  });
});

describe("parseJsonLinkGroups", () => {
  it("restores createdAt as Date", () => {
    const [group] = parseJsonLinkGroups([
      {
        label: "Today",
        links: [{ ...link(new Date(0), "a"), createdAt: "2025-06-15T10:00:00.000Z" }],
      },
    ]);
    expect(group.links[0].createdAt).toBeInstanceOf(Date);
    expect(group.links[0].createdAt.toISOString()).toBe("2025-06-15T10:00:00.000Z");
  });
});
