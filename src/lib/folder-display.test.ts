import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const {
  DEFAULT_FOLDER_EMOJI,
  FOLDER_EMOJI_PRESETS,
  formatLinkCount,
} = await import("./folder-display");
const folders = await import("./folders");

describe("FOLDER_EMOJI_PRESETS", () => {
  it("has 12 presets, the default oyster first", () => {
    expect(FOLDER_EMOJI_PRESETS).toHaveLength(12);
    expect(FOLDER_EMOJI_PRESETS[0].emoji).toBe(DEFAULT_FOLDER_EMOJI);
    expect(folders.DEFAULT_FOLDER_EMOJI).toBe(DEFAULT_FOLDER_EMOJI);
  });

  it("has unique emoji and labels", () => {
    const emoji = FOLDER_EMOJI_PRESETS.map((preset) => preset.emoji);
    const labels = FOLDER_EMOJI_PRESETS.map((preset) => preset.label);
    expect(new Set(emoji).size).toBe(emoji.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(FOLDER_EMOJI_PRESETS.map((preset) => [preset.label, preset.emoji]))(
    "%s (%s) passes the server emoji validation unchanged",
    (_label, emoji) => {
      expect(folders.normalizeFolderEmoji(emoji)).toBe(emoji);
    },
  );
});

describe("formatLinkCount", () => {
  it("pluralizes", () => {
    expect(formatLinkCount(0)).toBe("0 links");
    expect(formatLinkCount(1)).toBe("1 link");
    expect(formatLinkCount(2)).toBe("2 links");
    expect(formatLinkCount(1000)).toBe("1000 links");
  });
});
