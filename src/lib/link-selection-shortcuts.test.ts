import { describe, expect, it } from "vitest";
import {
  matchSelectionShortcut,
  selectionShortcutLabel,
} from "./link-selection-shortcuts";

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("matchSelectionShortcut", () => {
  const apple = { apple: true };
  const other = { apple: false };

  it("Esc clears", () => {
    expect(matchSelectionShortcut(key("Escape"), apple)).toBe("clear");
  });

  it("select all is ⌘A on Apple platforms and Ctrl+A elsewhere", () => {
    expect(matchSelectionShortcut(key("a", { metaKey: true }), apple)).toBe("selectAll");
    expect(matchSelectionShortcut(key("A", { metaKey: true }), apple)).toBe("selectAll");
    expect(matchSelectionShortcut(key("a", { ctrlKey: true }), apple)).toBeNull();
    expect(matchSelectionShortcut(key("a", { ctrlKey: true }), other)).toBe("selectAll");
    expect(matchSelectionShortcut(key("a", { metaKey: true, shiftKey: true }), apple)).toBeNull();
  });

  it("Delete and Backspace delete, M moves, only without modifiers", () => {
    expect(matchSelectionShortcut(key("Backspace"), apple)).toBe("delete");
    expect(matchSelectionShortcut(key("Delete"), other)).toBe("delete");
    expect(matchSelectionShortcut(key("m"), apple)).toBe("move");
    expect(matchSelectionShortcut(key("M"), apple)).toBe("move");
    expect(matchSelectionShortcut(key("Backspace", { metaKey: true }), apple)).toBeNull();
    expect(matchSelectionShortcut(key("m", { ctrlKey: true }), other)).toBeNull();
  });

  it("ignores other keys", () => {
    expect(matchSelectionShortcut(key("a"), apple)).toBeNull();
    expect(matchSelectionShortcut(key("Enter"), apple)).toBeNull();
  });
});

describe("selectionShortcutLabel", () => {
  it("uses platform symbols", () => {
    expect(selectionShortcutLabel("selectAll", { apple: true })).toBe("⌘A");
    expect(selectionShortcutLabel("selectAll", { apple: false })).toBe("Ctrl+A");
    expect(selectionShortcutLabel("delete", { apple: true })).toBe("⌫");
    expect(selectionShortcutLabel("clear", { apple: false })).toBe("Esc");
  });
});
