import { describe, expect, it } from "vitest";
import {
  classifyDrag,
  PULL_MAX,
  PULL_SLOP,
  PULL_THRESHOLD,
  pullDistance,
} from "./pull-to-refresh";

describe("pullDistance", () => {
  it("moves the list half as far as the finger", () => {
    expect(pullDistance(40)).toBe(20);
    expect(pullDistance(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
  });

  it("is capped, and ignores upward travel", () => {
    expect(pullDistance(10_000)).toBe(PULL_MAX);
    expect(pullDistance(-30)).toBe(0);
  });
});

describe("classifyDrag", () => {
  it("waits until the finger has moved past the slop", () => {
    expect(classifyDrag(0, PULL_SLOP - 1)).toBe("undecided");
  });

  it("is a pull when the drag is mainly downward", () => {
    expect(classifyDrag(3, 20)).toBe("pull");
  });

  it("ignores upward and sideways drags", () => {
    expect(classifyDrag(0, -20)).toBe("ignore");
    expect(classifyDrag(20, 10)).toBe("ignore");
  });
});
