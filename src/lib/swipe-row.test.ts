import { describe, expect, it } from "vitest";
import { decideSwipe, SWIPE_REVEAL } from "./swipe-row";

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
