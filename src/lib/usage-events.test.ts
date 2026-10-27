import { afterEach, describe, expect, it, vi } from "vitest";
import { requestUsageRefresh, USAGE_CHANGED_EVENT } from "./usage-events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestUsageRefresh", () => {
  it("dispatches the usage-changed event on window", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const listener = vi.fn();
    target.addEventListener(USAGE_CHANGED_EVENT, listener);

    requestUsageRefresh();

    expect(USAGE_CHANGED_EVENT).toBe("purl:usage-changed");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a window (server render)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => requestUsageRefresh()).not.toThrow();
  });
});
