/**
 * Client-safe folder display constants and copy helpers (no server imports),
 * shared by the folder UI and `src/lib/folders.ts`.
 */

/** Emoji shown for a folder that has none stored (the oyster — home of a pearl). */
export const DEFAULT_FOLDER_EMOJI = "🦪";

export type FolderEmojiPreset = { emoji: string; label: string };

/**
 * Emoji offered by the folder create/edit dialog, default first. Pictographs
 * without default emoji presentation (✈️, ❤️, 🛠️) carry U+FE0F so they pass
 * the server's single-emoji validation.
 */
export const FOLDER_EMOJI_PRESETS: readonly FolderEmojiPreset[] = [
  { emoji: DEFAULT_FOLDER_EMOJI, label: "Oyster" },
  { emoji: "📚", label: "Books" },
  { emoji: "🎨", label: "Art" },
  { emoji: "💡", label: "Idea" },
  { emoji: "🧠", label: "Brain" },
  { emoji: "🛠️", label: "Tools" },
  { emoji: "🎧", label: "Music" },
  { emoji: "🎬", label: "Film" },
  { emoji: "✈️", label: "Travel" },
  { emoji: "🍳", label: "Cooking" },
  { emoji: "💼", label: "Work" },
  { emoji: "❤️", label: "Love" },
];

/** "1 link", "0 links", "3 links". */
export function formatLinkCount(count: number): string {
  return `${count} ${count === 1 ? "link" : "links"}`;
}
