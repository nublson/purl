import { describe, expect, it } from "vitest";
import { markPaths } from "./play-mark-path";

describe("markPaths", () => {
  it("draws the pause as two bars at t = 0", () => {
    expect(markPaths(0).left).toBe("M6.00 4.00L10.00 4.00L10.00 20.00L6.00 20.00Z");
  });

  it("draws the play's right half as a collapsed quad at t = 1", () => {
    expect(markPaths(1).right).toBe("M13.25 8.00L20.00 12.00L20.00 12.00L13.25 16.00Z");
  });

  it("interpolates every point halfway at t = 0.5", () => {
    expect(markPaths(0.5).left.startsWith("M6.25 4.00L11.63 6.00")).toBe(true);
  });
});
