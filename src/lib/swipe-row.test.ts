import { describe, expect, it } from "vitest";
import {
  SWIPE_OPEN_X,
  SWIPE_READ_AT,
  swipeAxis,
  swipeOffset,
  swipeRelease,
  swipeRevealed,
} from "./swipe-row";

describe("swipeAxis", () => {
  it("waits for 10px of travel, then picks the dominant axis", () => {
    expect(swipeAxis(6, 6)).toBeNull();
    expect(swipeAxis(12, 4)).toBe("x");
    expect(swipeAxis(-12, 4)).toBe("x");
    expect(swipeAxis(4, 12)).toBe("y");
    // A diagonal is a scroll: sideways has to win outright.
    expect(swipeAxis(9, 9)).toBe("y");
  });
});

describe("swipeOffset", () => {
  it("follows the finger, then resists past the stops", () => {
    expect(swipeOffset(50, { fromOpen: false })).toBe(50);
    expect(swipeOffset(120, { fromOpen: false })).toBe(120);
    expect(swipeOffset(220, { fromOpen: false })).toBe(140);
    expect(swipeOffset(SWIPE_OPEN_X, { fromOpen: false })).toBe(SWIPE_OPEN_X);
    expect(swipeOffset(SWIPE_OPEN_X - 100, { fromOpen: false })).toBe(
      SWIPE_OPEN_X - 5,
    );
  });

  it("only closes a row that started open (no read swipe from there)", () => {
    expect(swipeOffset(-40, { fromOpen: true })).toBe(-40);
    expect(swipeOffset(60, { fromOpen: true })).toBe(0);
  });
});

describe("swipeRelease", () => {
  it("toggles read past the threshold, opens past halfway, else closes", () => {
    expect(swipeRelease(SWIPE_READ_AT)).toBe("read");
    expect(swipeRelease(SWIPE_READ_AT - 1)).toBe("close");
    expect(swipeRelease(0)).toBe("close");
    expect(swipeRelease(SWIPE_OPEN_X / 2 + 1)).toBe("close");
    expect(swipeRelease(SWIPE_OPEN_X / 2)).toBe("open");
    expect(swipeRelease(SWIPE_OPEN_X)).toBe("open");
  });
});

describe("swipeRevealed", () => {
  it("shows the outer button at 40px and the second at 76px, both when open", () => {
    expect(swipeRevealed(-39)).toBe(0);
    expect(swipeRevealed(-40)).toBe(1);
    expect(swipeRevealed(-76)).toBe(2);
    expect(swipeRevealed(SWIPE_OPEN_X)).toBe(2);
    expect(swipeRevealed(30)).toBe(0);
  });
});
