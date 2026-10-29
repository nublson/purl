import { afterEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_SHORTCUT, isUploadShortcut } from "./upload-picker";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload picker", () => {
  it("the shortcut is U", () => {
    expect(UPLOAD_SHORTCUT).toBe("U");
  });

});

describe("isUploadShortcut", () => {
  const key = (init: Partial<KeyboardEvent>) =>
    ({
      key: "u",
      defaultPrevented: false,
      repeat: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    }) as KeyboardEvent;

  it("takes a plain u or U", () => {
    expect(isUploadShortcut(key({ key: "u" }))).toBe(true);
    expect(isUploadShortcut(key({ key: "U" }))).toBe(true);
  });

  it("ignores other keys, repeats, handled events and any modifier", () => {
    expect(isUploadShortcut(key({ key: "a" }))).toBe(false);
    expect(isUploadShortcut(key({ repeat: true }))).toBe(false);
    expect(isUploadShortcut(key({ defaultPrevented: true }))).toBe(false);
    for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const) {
      expect(isUploadShortcut(key({ [modifier]: true }))).toBe(false);
    }
  });
});
