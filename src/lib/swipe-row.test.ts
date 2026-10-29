import { describe, expect, it } from "vitest";
import { decideSwipe, settleDuration, SWIPE_REVEAL, SWIPE_SETTLE_MS } from "./swipe-row";

const width = 224;

describe("decideSwipe", () => {
  it("shuts a short, slow swipe", () => {
    expect(decideSwipe({ distance: 20, velocity: 0, width })).toBe("closed");
  });

  it("stays open past half the reveal", () => {
    expect(decideSwipe({ distance: SWIPE_REVEAL / 2, velocity: 0, width })).toBe("open");
    expect(decideSwipe({ distance: 100, velocity: 0, width })).toBe("open");
  });

  it("opens on a flick toward the action from anywhere", () => {
    expect(decideSwipe({ distance: 10, velocity: 0.8, width })).toBe("open");
  });

  it("acts past 60% of the row", () => {
    expect(decideSwipe({ distance: width * 0.6, velocity: 0, width })).toBe("full");
  });

  it("shuts on a flick back, however far open", () => {
    expect(decideSwipe({ distance: width, velocity: -0.8, width })).toBe("closed");
  });
});

describe("settleDuration", () => {
  it("takes the default for a slow release", () => {
    expect(settleDuration(50, 0.05)).toBe(SWIPE_SETTLE_MS);
  });

  it("keeps a flick's pace, within 120–240ms", () => {
    expect(settleDuration(150, 1)).toBe(150);
    expect(settleDuration(30, 2)).toBe(120);
    expect(settleDuration(200, -0.4)).toBe(240);
  });
});
