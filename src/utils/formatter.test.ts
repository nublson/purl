import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatChatHistoryTime,
  getRelativeDateLabel,
  getUrlDomain,
  groupChatsByChatHistoryDate,
} from "./formatter";

describe("getUrlDomain", () => {
  it("strips www. prefix", () => {
    expect(getUrlDomain("https://www.example.com/path")).toBe("example.com");
  });

  it("leaves non-www hostnames unchanged", () => {
    expect(getUrlDomain("https://example.com/path")).toBe("example.com");
  });

  it("handles invalid URLs by returning the input", () => {
    expect(getUrlDomain("not-a-url")).toBe("not-a-url");
  });
});

describe("getRelativeDateLabel", () => {
  const fixedNow = new Date(2025, 5, 15); // 2025-06-15

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Today for same day", () => {
    expect(getRelativeDateLabel(new Date(2025, 5, 15))).toBe("Today");
  });

  it("returns This Week for 1-7 days ago", () => {
    expect(getRelativeDateLabel(new Date(2025, 5, 12))).toBe("This Week"); // 3 days ago
  });

  it("returns Last Week for 8-14 days ago", () => {
    expect(getRelativeDateLabel(new Date(2025, 5, 5))).toBe("Last Week"); // 10 days ago
  });

  it("returns This Month for 15-31 days ago", () => {
    expect(getRelativeDateLabel(new Date(2025, 4, 26))).toBe("This Month"); // 20 days ago
  });

  it("returns Last Month for dates in previous calendar month", () => {
    expect(getRelativeDateLabel(new Date(2025, 4, 10))).toBe("Last Month"); // May 10
  });

  it("returns This Year for earlier same year", () => {
    expect(getRelativeDateLabel(new Date(2025, 0, 20))).toBe("This Year"); // Jan 20
  });

  it("returns Last Year for previous year", () => {
    expect(getRelativeDateLabel(new Date(2024, 8, 1))).toBe("Last Year");
  });

  it("returns Older for 2+ years ago", () => {
    expect(getRelativeDateLabel(new Date(2023, 0, 1))).toBe("Older");
  });
});

describe("formatChatHistoryTime", () => {
  const fixedNow = new Date(2025, 5, 15, 14, 30, 0); // 2025-06-15 14:30:00

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a time string (containing ':') for a timestamp from today", () => {
    const todayAt9am = new Date(2025, 5, 15, 9, 0, 0).toISOString();

    const result = formatChatHistoryTime(todayAt9am);

    expect(result).toMatch(/:/);
  });

  it("returns a date string (not containing ':') for a timestamp from a previous day", () => {
    const yesterday = new Date(2025, 5, 14, 10, 0, 0).toISOString();

    const result = formatChatHistoryTime(yesterday);

    expect(result).not.toMatch(/\d:\d/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("produces a different format for today versus a past date", () => {
    const today = new Date(2025, 5, 15, 8, 0, 0).toISOString();
    const past = new Date(2025, 4, 1, 8, 0, 0).toISOString();

    expect(formatChatHistoryTime(today)).not.toBe(formatChatHistoryTime(past));
  });
});

describe("groupChatsByChatHistoryDate", () => {
  const fixedNow = new Date(2025, 5, 15, 12, 0, 0); // 2025-06-15

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty array for an empty input", () => {
    expect(groupChatsByChatHistoryDate([])).toEqual([]);
  });

  it("places a chat updated today into the 'Today' group", () => {
    const chats = [{ id: "c1", updatedAt: new Date(2025, 5, 15, 10, 0, 0).toISOString() }];

    const groups = groupChatsByChatHistoryDate(chats);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].chats).toEqual(chats);
  });

  it("places a chat updated yesterday into the 'Yesterday' group", () => {
    const chats = [{ id: "c2", updatedAt: new Date(2025, 5, 14, 10, 0, 0).toISOString() }];

    const groups = groupChatsByChatHistoryDate(chats);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Yesterday");
    expect(groups[0].chats).toEqual(chats);
  });

  it("places a chat updated before yesterday into the 'Earlier' group", () => {
    const chats = [{ id: "c3", updatedAt: new Date(2025, 4, 1, 10, 0, 0).toISOString() }];

    const groups = groupChatsByChatHistoryDate(chats);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Earlier");
    expect(groups[0].chats).toEqual(chats);
  });

  it("omits groups that have no chats", () => {
    const chats = [
      { id: "c1", updatedAt: new Date(2025, 5, 15, 10, 0, 0).toISOString() },
      { id: "c2", updatedAt: new Date(2025, 4, 1, 10, 0, 0).toISOString() },
    ];

    const groups = groupChatsByChatHistoryDate(chats);

    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Today");
    expect(labels).toContain("Earlier");
    expect(labels).not.toContain("Yesterday");
  });

  it("groups multiple chats from the same bucket together", () => {
    const chats = [
      { id: "c1", updatedAt: new Date(2025, 5, 15, 9, 0, 0).toISOString() },
      { id: "c2", updatedAt: new Date(2025, 5, 15, 11, 0, 0).toISOString() },
    ];

    const groups = groupChatsByChatHistoryDate(chats);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].chats).toHaveLength(2);
  });
});
