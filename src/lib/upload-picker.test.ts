import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UPLOAD_PICK_EVENT,
  UPLOAD_SHORTCUT,
  isUploadShortcut,
  openUploadPicker,
} from "./upload-picker";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload picker", () => {
  it("the shortcut is U", () => {
    expect(UPLOAD_SHORTCUT).toBe("U");
  });

  it("openUploadPicker dispatches purl:upload-pick on window", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const heard = vi.fn();
    target.addEventListener("purl:upload-pick", heard);

    expect(openUploadPicker()).toBe(false);

    expect(UPLOAD_PICK_EVENT).toBe("purl:upload-pick");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("returns true once a mounted picker takes the event", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    target.addEventListener("purl:upload-pick", (event) => event.preventDefault());

    expect(openUploadPicker()).toBe(true);
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
