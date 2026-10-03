import { describe, expect, it } from "vitest";
import { folderShortcutKey, matchFolderShortcut } from "./folder-shortcuts";

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("folderShortcutKey", () => {
  it("numbers the first nine folders from 1", () => {
    expect(folderShortcutKey(0)).toBe("1");
    expect(folderShortcutKey(8)).toBe("9");
    expect(folderShortcutKey(9)).toBeNull();
  });
});

describe("matchFolderShortcut", () => {
  const folders = ["a", "b", "c"];

  it("0 is Home and 1–9 are folders in menu order", () => {
    expect(matchFolderShortcut(key("0"), folders)).toBe("home");
    expect(matchFolderShortcut(key("1"), folders)).toBe("a");
    expect(matchFolderShortcut(key("3"), folders)).toBe("c");
  });

  it("ignores digits with no folder, other keys, and modifiers", () => {
    expect(matchFolderShortcut(key("4"), folders)).toBeNull();
    expect(matchFolderShortcut(key("a"), folders)).toBeNull();
    expect(matchFolderShortcut(key("1", { metaKey: true }), folders)).toBeNull();
    expect(matchFolderShortcut(key("1", { ctrlKey: true }), folders)).toBeNull();
    expect(matchFolderShortcut(key("1", { shiftKey: true }), folders)).toBeNull();
  });
});
