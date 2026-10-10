import { afterEach, describe, expect, it, vi } from "vitest";
import { isOverlayOpen, isTypingTarget } from "./keyboard";

class FakeElement {
  constructor(private inTextField: boolean) {}

  closest() {
    return this.inTextField ? this : null;
  }
}

describe("isTypingTarget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false for null and non-elements", () => {
    vi.stubGlobal("Element", FakeElement);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as unknown as EventTarget)).toBe(false);
  });

  it("is true when closest finds a text field", () => {
    vi.stubGlobal("Element", FakeElement);
    expect(isTypingTarget(new FakeElement(true) as unknown as EventTarget)).toBe(true);
  });

  it("is false when the target is not in a text field", () => {
    vi.stubGlobal("Element", FakeElement);
    expect(isTypingTarget(new FakeElement(false) as unknown as EventTarget)).toBe(false);
  });
});

describe("isOverlayOpen", () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  function stubDocument({
    scrollLocked,
    openPopover,
  }: {
    scrollLocked: boolean;
    openPopover: boolean;
  }) {
    Object.defineProperty(globalThis, "document", {
      value: {
        body: {
          hasAttribute: (name: string) =>
            name === "data-scroll-locked" && scrollLocked,
        },
        querySelector: (selector: string) => {
          if (
            selector === '[data-slot="popover-content"][data-state="open"]' &&
            openPopover
          ) {
            return {};
          }
          return null;
        },
      },
      configurable: true,
      writable: true,
    });
  }

  it("is false with no modal scroll lock or open popover", () => {
    stubDocument({ scrollLocked: false, openPopover: false });
    expect(isOverlayOpen()).toBe(false);
  });

  it("is true when a modal dialog locked scrolling", () => {
    stubDocument({ scrollLocked: true, openPopover: false });
    expect(isOverlayOpen()).toBe(true);
  });

  it("is true when a popover content panel is open", () => {
    stubDocument({ scrollLocked: false, openPopover: true });
    expect(isOverlayOpen()).toBe(true);
  });
});
