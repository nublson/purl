import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupLinksByDate, type Link } from "./links";

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
    ingestStatus: "COMPLETED",
    ingestFailureReason: null,
    createdAt,
  };
}

describe("groupLinksByDate", () => {
  const fixedNow = new Date(2025, 5, 15); // 2025-06-15

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups links into correct buckets by relative date", () => {
    const today = new Date(2025, 5, 15);
    const thisWeek = new Date(2025, 5, 12);
    const lastWeek = new Date(2025, 5, 5);
    const links: Link[] = [
      link(lastWeek, "last week"),
      link(today, "today"),
      link(thisWeek, "this week"),
    ];
    const groups = groupLinksByDate(links);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].links.map((l) => l.title)).toEqual(["today"]);
    expect(groups[1].label).toBe("This Week");
    expect(groups[1].links.map((l) => l.title)).toEqual(["this week"]);
    expect(groups[2].label).toBe("Last Week");
    expect(groups[2].links.map((l) => l.title)).toEqual(["last week"]);
  });

  it("sorts links within a group newest-first", () => {
    const today1 = new Date(2025, 5, 15, 10, 0);
    const today2 = new Date(2025, 5, 15, 12, 0);
    const links: Link[] = [link(today1, "first"), link(today2, "second")];
    const groups = groupLinksByDate(links);
    expect(groups[0].links.map((l) => l.title)).toEqual(["second", "first"]);
  });

  it("filters out empty groups", () => {
    const today = new Date(2025, 5, 15);
    const lastYear = new Date(2024, 0, 1);
    const links: Link[] = [link(today, "today"), link(lastYear, "last year")];
    const groups = groupLinksByDate(links);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Last Year"]);
  });

  it("returns groups in canonical label order", () => {
    const lastYear = new Date(2024, 0, 1);
    const today = new Date(2025, 5, 15);
    const links: Link[] = [link(lastYear, "old"), link(today, "new")];
    const groups = groupLinksByDate(links);
    const labels = groups.map((g) => g.label);
    expect(labels).toEqual(["Today", "Last Year"]);
    const order = [
      "Today",
      "This Week",
      "Last Week",
      "This Month",
      "Last Month",
      "This Year",
      "Last Year",
      "Older",
    ];
    for (let i = 1; i < labels.length; i++) {
      expect(order.indexOf(labels[i])).toBeGreaterThan(
        order.indexOf(labels[i - 1]),
      );
    }
  });
});
