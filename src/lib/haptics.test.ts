import { afterEach, describe, expect, it, vi } from "vitest";
import { afterTap, haptic, HAPTIC_PATTERNS, type HapticKind } from "./haptics";

function stubDevice({ coarse, vibrate }: { coarse: boolean; vibrate?: (pattern: number[]) => boolean }) {
  vi.stubGlobal("navigator", vibrate ? { vibrate } : {});
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("haptic", () => {
  it("has the spec's patterns", () => {
    expect(HAPTIC_PATTERNS).toEqual({
      selection: [10],
      success: [10, 60, 10],
      warning: [25, 60, 25],
    });
  });

  it.each(["selection", "success", "warning"] as HapticKind[])(
    "%s vibrates its pattern on a touch screen",
    (kind) => {
      const vibrate = vi.fn(() => true);
      stubDevice({ coarse: true, vibrate });
      haptic(kind);
      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS[kind]);
    },
  );

  it("does nothing with a mouse (desktop Chrome has a no-op vibrate)", () => {
    const vibrate = vi.fn(() => true);
    stubDevice({ coarse: false, vibrate });
    haptic("selection");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing without vibrate (iOS)", () => {
    stubDevice({ coarse: true });
    expect(() => haptic("selection")).not.toThrow();
  });

  it("does nothing on the server", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("matchMedia", undefined);
    expect(() => haptic("selection")).not.toThrow();
  });

  it("does nothing when matchMedia is missing (SSR)", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("matchMedia", undefined);
    haptic("selection");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a throwing vibrate", () => {
    stubDevice({
      coarse: true,
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(() => haptic("warning")).not.toThrow();
  });
});

describe("afterTap", () => {
  it("runs the action in the next task, not during the tap", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    afterTap(action);
    expect(action).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(action).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
