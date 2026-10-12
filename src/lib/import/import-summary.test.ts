import { describe, expect, it } from "vitest";
import {
  doneSummary,
  importableCount,
  previewSummary,
} from "./import-summary";
import type { ImportLinksResult } from "./types";

describe("importableCount", () => {
  it("is the smaller of the items and the room, never negative", () => {
    expect(importableCount(312, 1000)).toBe(312);
    expect(importableCount(312, 100)).toBe(100);
    expect(importableCount(312, -5)).toBe(0);
  });
});

describe("previewSummary", () => {
  const base = {
    format: "bookmarks-html" as const,
    itemCount: 312,
    folders: Array.from({ length: 14 }, (_, i) => ({ name: `F${i}`, count: 1 })),
    skipped: 0,
  };

  it("describes a file that fits", () => {
    expect(previewSummary(base, 1000, [])).toEqual({
      heading: "312 links in 14 folders",
      lines: ["Browser bookmarks", "All 312 fit."],
    });
  });

  it("uses singular forms and names the other formats", () => {
    const summary = previewSummary(
      {
        format: "raindrop-csv",
        itemCount: 1,
        folders: [{ name: "A", count: 1 }],
        skipped: 1,
      },
      10,
      [],
    );
    expect(summary.heading).toBe("1 link in 1 folder");
    expect(summary.lines).toEqual([
      "Raindrop CSV",
      "All 1 fit.",
      "1 item isn’t a web link and will be skipped.",
    ]);
  });

  it("says the newest links are imported when there isn't room", () => {
    expect(previewSummary({ ...base, itemCount: 900 }, 640, []).lines).toContain(
      "You have room for 640 more, so the 640 newest are imported.",
    );
  });

  it("notes a file without folders", () => {
    const summary = previewSummary(
      { format: "pocket-csv", itemCount: 312, folders: [], skipped: 4 },
      1000,
      [],
    );
    expect(summary).toEqual({
      heading: "312 links",
      lines: [
        "Pocket CSV",
        "All 312 fit.",
        "This file has no folder information, so links go to Home.",
        "4 items aren’t web links and will be skipped.",
      ],
    });
  });

  it("counts only new folders beyond the room under the folder limit", () => {
    const folders = Array.from({ length: 5 }, (_, i) => ({
      name: `New ${i}`,
      count: 1,
    }));
    folders.push({ name: "inbox", count: 2 });
    const existing = ["Inbox", ...Array.from({ length: 96 }, (_, i) => `E${i}`)];
    // 97 existing, room for 3 more; 5 new names -> 2 don't fit.
    const summary = previewSummary(
      { format: "bookmarks-html", itemCount: 10, folders, skipped: 0 },
      1000,
      existing,
    );
    expect(summary.lines).toContain(
      "2 folders won’t fit in your 100-folder limit; their links go to Home.",
    );
  });

  it("omits the folder-limit line when everything fits", () => {
    expect(
      previewSummary(base, 1000, []).lines.some((l) => l.includes("folder limit")),
    ).toBe(false);
  });
});

describe("doneSummary", () => {
  const none: ImportLinksResult = {
    imported: 0,
    duplicates: 0,
    invalid: 0,
    overLimit: 0,
    foldersCreated: 0,
    unfiledForFolderLimit: 0,
    limitReached: false,
  };

  it("summarizes a full import", () => {
    expect(
      doneSummary(
        {
          imported: 300,
          duplicates: 8,
          invalid: 3,
          overLimit: 5,
          foldersCreated: 12,
          unfiledForFolderLimit: 2,
          limitReached: true,
        },
        1,
      ),
    ).toEqual({
      title: "Imported 300 links",
      lines: [
        "Created 12 folders.",
        "8 were already saved and were skipped.",
        "4 weren’t web links.",
        "5 weren’t imported because you reached your 1,000-link limit.",
        "2 links went to Home because you reached your 100-folder limit.",
        "Thumbnails and details fill in over the next few minutes.",
      ],
    });
  });

  it("uses singular forms", () => {
    expect(
      doneSummary(
        { ...none, imported: 1, duplicates: 1, invalid: 1, foldersCreated: 1, unfiledForFolderLimit: 1 },
        0,
      ),
    ).toEqual({
      title: "Imported 1 link",
      lines: [
        "Created 1 folder.",
        "1 was already saved and was skipped.",
        "1 wasn’t a web link.",
        "1 link went to Home because you reached your 100-folder limit.",
        "Thumbnails and details fill in over the next few minutes.",
      ],
    });
  });

  it("says nothing new when everything was already saved", () => {
    expect(doneSummary({ ...none, duplicates: 8, invalid: 2 }, 0)).toEqual({
      title: "Nothing new to import",
      lines: ["All 8 links were already saved.", "2 weren’t web links."],
    });
  });

  it("keeps the generic duplicate line when nothing was imported for another reason", () => {
    const summary = doneSummary(
      { ...none, duplicates: 2, overLimit: 4, limitReached: true },
      0,
    );
    expect(summary.title).toBe("Nothing new to import");
    expect(summary.lines).toEqual([
      "2 were already saved and were skipped.",
      "4 weren’t imported because you reached your 1,000-link limit.",
    ]);
  });
});
