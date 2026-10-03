import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const { suggestFolderEmoji, TOPIC_EMOJI } = await import("./emoji-suggestion");
const { normalizeFolderEmoji } = await import("./folders");

describe("suggestFolderEmoji", () => {
  it.each([
    ["Reading list", "📚"],
    ["Design Engineer", "🎨"],
    ["Recipes", "🍳"],
    ["Cooking", "🍳"],
    ["Travel ideas", "✈️"],
    ["Side projects", "🚀"],
    ["UI/UX inspo", "🎨"],
    ["  my PODCASTS  ", "🎧"],
    ["Stories about cities", "🗺️"],
  ])("%j → %s", (name, emoji) => {
    expect(suggestFolderEmoji(name)).toBe(emoji);
  });

  it("uses the first word that names a topic", () => {
    expect(suggestFolderEmoji("Work music")).toBe("💼");
    expect(suggestFolderEmoji("Music for work")).toBe("🎵");
  });

  it("suggests nothing when no word names a topic", () => {
    expect(suggestFolderEmoji("Xyzzy")).toBeNull();
    expect(suggestFolderEmoji("")).toBeNull();
    expect(suggestFolderEmoji("!!!")).toBeNull();
  });

  it("only suggests emoji a folder can save", () => {
    for (const emoji of TOPIC_EMOJI) {
      expect(normalizeFolderEmoji(emoji)).toBe(emoji);
    }
  });
});
