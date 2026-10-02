import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const {
  DEFAULT_FOLDER_EMOJI,
  MAX_FOLDER_DESCRIPTION_LENGTH,
  formatFolderLabel,
  formatLinkCount,
  formatBulkMoveMessage,
} = await import("./folder-display");
const folders = await import("./folders");

describe("shared folder constants", () => {
  it("are the ones the server enforces", () => {
    expect(DEFAULT_FOLDER_EMOJI).toBe("🦪");
    expect(folders.DEFAULT_FOLDER_EMOJI).toBe(DEFAULT_FOLDER_EMOJI);
    expect(folders.normalizeFolderEmoji(DEFAULT_FOLDER_EMOJI)).toBe(
      DEFAULT_FOLDER_EMOJI,
    );
    expect(folders.MAX_FOLDER_DESCRIPTION_LENGTH).toBe(
      MAX_FOLDER_DESCRIPTION_LENGTH,
    );
  });
});

describe("formatFolderLabel", () => {
  it("puts the emoji before the name", () => {
    expect(formatFolderLabel({ emoji: "🧑‍🎨", name: "Design Engineering" })).toBe(
      "🧑‍🎨 Design Engineering",
    );
  });
});

describe("formatLinkCount", () => {
  it("pluralizes", () => {
    expect(formatLinkCount(0)).toBe("0 links");
    expect(formatLinkCount(1)).toBe("1 link");
    expect(formatLinkCount(2)).toBe("2 links");
    expect(formatLinkCount(1000)).toBe("1000 links");
  });
});

describe("formatBulkMoveMessage", () => {
  const reading = { emoji: "📚", name: "Reading" };

  it("names the target folder", () => {
    expect(formatBulkMoveMessage({ count: 3, target: reading, source: null })).toBe(
      "Moved 3 links to 📚 Reading",
    );
  });

  it("names the folder the links left, or says 'their folders' when they came from several", () => {
    expect(formatBulkMoveMessage({ count: 1, target: null, source: reading })).toBe(
      "Removed 1 link from 📚 Reading",
    );
    expect(formatBulkMoveMessage({ count: 2, target: null, source: null })).toBe(
      "Removed 2 links from their folders",
    );
  });
});
