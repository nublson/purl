import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const {
  DEFAULT_FOLDER_EMOJI,
  MAX_FOLDER_DESCRIPTION_LENGTH,
  formatLinkCount,
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

describe("formatLinkCount", () => {
  it("pluralizes", () => {
    expect(formatLinkCount(0)).toBe("0 links");
    expect(formatLinkCount(1)).toBe("1 link");
    expect(formatLinkCount(2)).toBe("2 links");
    expect(formatLinkCount(1000)).toBe("1000 links");
  });
});
