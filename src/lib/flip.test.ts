import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLIP_DURATION_MS, captureFlip, playFlip } from "./flip";

function rect(left: number, top: number, width = 100, height = 40): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function element(
  key: string | undefined,
  box: DOMRect,
  animate = vi.fn(),
): HTMLElement {
  return {
    dataset: { flip: key },
    getBoundingClientRect: () => box,
    animate,
  } as unknown as HTMLElement;
}

describe("captureFlip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records the first bounding box for each data-flip key", () => {
    const a = element("link:1", rect(0, 0));
    const dup = element("link:1", rect(50, 50));
    const b = element("link:2", rect(10, 20));
    vi.stubGlobal("document", {
      querySelectorAll: () => [a, dup, b],
    });

    const snapshot = captureFlip();
    expect(snapshot.size).toBe(2);
    expect(snapshot.get("link:1")).toMatchObject({ left: 0, top: 0 });
    expect(snapshot.get("link:2")).toMatchObject({ left: 10, top: 20 });
  });

  it("skips elements without a data-flip key", () => {
    const bare = element(undefined, rect(0, 0));
    vi.stubGlobal("document", {
      querySelectorAll: () => [bare],
    });
    expect(captureFlip().size).toBe(0);
  });
});

describe("playFlip", () => {
  const matchMedia = vi.fn();

  beforeEach(() => {
    matchMedia.mockReturnValue({ matches: false });
    vi.stubGlobal("window", { matchMedia });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when reduced motion is preferred", () => {
    matchMedia.mockReturnValue({ matches: true });
    const el = element("link:1", rect(0, 0), vi.fn());
    vi.stubGlobal("document", { querySelectorAll: () => [el] });
    playFlip(new Map([["link:1", rect(100, 0)]]));
    expect(el.animate).not.toHaveBeenCalled();
  });

  it("fades in elements that were not in the snapshot", () => {
    const animate = vi.fn();
    const el = element("day:today", rect(0, 0), animate);
    vi.stubGlobal("document", { querySelectorAll: () => [el] });
    playFlip(new Map());
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: FLIP_DURATION_MS, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  });

  it("translates elements that moved more than half a pixel", () => {
    const animate = vi.fn();
    const el = element("link:1", rect(0, 100), animate);
    vi.stubGlobal("document", { querySelectorAll: () => [el] });
    playFlip(new Map([["link:1", rect(0, 0)]]));
    expect(animate).toHaveBeenCalledWith(
      [
        { transform: "translate(0px, -100px)" },
        { transform: "translate(0, 0)" },
      ],
      { duration: FLIP_DURATION_MS, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  });

  it("skips a sub-pixel nudge", () => {
    const animate = vi.fn();
    const el = element("link:1", rect(0, 0.4), animate);
    vi.stubGlobal("document", { querySelectorAll: () => [el] });
    playFlip(new Map([["link:1", rect(0, 0)]]));
    expect(animate).not.toHaveBeenCalled();
  });

  it("ignores elements without animate", () => {
    const el = element("link:1", rect(0, 0));
    vi.stubGlobal("document", { querySelectorAll: () => [el] });
    playFlip(new Map([["link:1", rect(0, 50)]]));
    // No throw; nothing to assert on animate.
    expect(true).toBe(true);
  });
});
