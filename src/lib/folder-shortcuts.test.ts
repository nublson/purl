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
  it("numbers folders 2–9 then 0, in number-row order (Home is 1)", () => {
    expect(folderShortcutKey(0)).toBe("2");
    expect(folderShortcutKey(7)).toBe("9");
    expect(folderShortcutKey(8)).toBe("0");
    expect(folderShortcutKey(9)).toBeNull();
  });
});

describe("matchFolderShortcut", () => {
  const folders = ["a", "b", "c"];

  it("1 is Home and 2–9, then 0, are folders in menu order", () => {
    expect(matchFolderShortcut(key("1"), folders)).toBe("home");
    expect(matchFolderShortcut(key("2"), folders)).toBe("a");
    expect(matchFolderShortcut(key("4"), folders)).toBe("c");
    const nine = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"];
    expect(matchFolderShortcut(key("0"), nine)).toBe("f9");
  });

  it("ignores keys with no folder, other keys, and modifiers", () => {
    expect(matchFolderShortcut(key("0"), folders)).toBeNull();
    expect(matchFolderShortcut(key("5"), folders)).toBeNull();
    expect(matchFolderShortcut(key("a"), folders)).toBeNull();
    expect(matchFolderShortcut(key("1", { metaKey: true }), folders)).toBeNull();
    expect(matchFolderShortcut(key("1", { ctrlKey: true }), folders)).toBeNull();
    expect(matchFolderShortcut(key("1", { shiftKey: true }), folders)).toBeNull();
  });
});

describe("matchFolderShortcut with a manual folder order", () => {
  it("maps digits to the folders' array order, not name order", () => {
    const folders = [{ name: "Zeta" }, { name: "alpha" }];
    expect(matchFolderShortcut(key("2"), folders)).toEqual({ name: "Zeta" });
    expect(matchFolderShortcut(key("3"), folders)).toEqual({ name: "alpha" });
  });
});
