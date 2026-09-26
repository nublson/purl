import { beforeEach, describe, expect, it, vi } from "vitest";

// Module-level state: load a fresh copy for each test.
let warmth: typeof import("./link-preview-warmth");

beforeEach(async () => {
  vi.resetModules();
  warmth = await import("./link-preview-warmth");
});

describe("link preview warmth", () => {
  it("waits before the first preview", () => {
    expect(warmth.previewOpenDelay()).toBe(warmth.PREVIEW_OPEN_DELAY_MS);
  });

  it("opens instantly after a hover-opened preview, until cooled", () => {
    const release = warmth.trackPreviewOpen(() => {}, { viaPointer: true });
    expect(warmth.previewOpenDelay()).toBe(0);

    release();
    expect(warmth.previewOpenDelay()).toBe(0);

    warmth.coolPreviews();
    expect(warmth.previewOpenDelay()).toBe(warmth.PREVIEW_OPEN_DELAY_MS);
  });

  it("does not warm the list for a keyboard-opened preview", () => {
    const release = warmth.trackPreviewOpen(() => {}, { viaPointer: false });
    expect(warmth.previewOpenDelay()).toBe(0);

    release();
    expect(warmth.previewOpenDelay()).toBe(warmth.PREVIEW_OPEN_DELAY_MS);
  });

  it("closes the previous preview when another opens", () => {
    const closeFirst = vi.fn();
    const releaseFirst = warmth.trackPreviewOpen(closeFirst, {
      viaPointer: true,
    });
    warmth.trackPreviewOpen(() => {}, { viaPointer: true });

    expect(closeFirst).toHaveBeenCalledOnce();
    releaseFirst();
  });
});
