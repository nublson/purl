import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLeavingLinks,
  getLeavingPhase as phaseOf,
  leavingFadeRemaining,
  LINK_LEAVE_MS,
  markLinksLeaving,
  settleLeavingLinks,
} from "./leaving-links";

describe("leaving links", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    settleLeavingLinks(Number.MAX_SAFE_INTEGER);
    vi.useRealTimers();
  });

  it("fades, then hides until a later reload settles it", () => {
    vi.setSystemTime(1_000);
    markLinksLeaving(["a"]);
    expect(phaseOf("a")).toBe("fading");
    expect(leavingFadeRemaining(1_050)).toBe(LINK_LEAVE_MS - 50);
    vi.advanceTimersByTime(LINK_LEAVE_MS);
    expect(phaseOf("a")).toBe("hidden");
    expect(leavingFadeRemaining()).toBe(0);

    // A reload that started before the move doesn't clear it...
    settleLeavingLinks(999);
    expect(phaseOf("a")).toBe("hidden");
    // ...one that started after does.
    settleLeavingLinks(1_000);
    expect(phaseOf("a")).toBeUndefined();
  });

  it("clearLeavingLinks drops every mark", () => {
    markLinksLeaving(["b"]);
    vi.advanceTimersByTime(LINK_LEAVE_MS);
    clearLeavingLinks();
    expect(phaseOf("b")).toBeUndefined();
  });
});
