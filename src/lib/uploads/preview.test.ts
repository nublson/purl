import { describe, expect, it } from "vitest";
import { PREVIEW_MAX_PX, PREVIEW_QUALITY, fitWithin, roundDuration } from "./preview";

describe("preview constants", () => {
  it("uses 1280 px at quality 0.82", () => {
    expect(PREVIEW_MAX_PX).toBe(1280);
    expect(PREVIEW_QUALITY).toBe(0.82);
  });
});

describe("fitWithin", () => {
  it("scales a landscape image to the long side", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
  });

  it("scales a portrait image to the long side", () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });

  it("never upscales", () => {
    expect(fitWithin(600, 400)).toEqual({ width: 600, height: 400 });
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720 });
  });

  it("rounds to whole pixels", () => {
    expect(fitWithin(1999, 1001)).toEqual({ width: 1280, height: 641 });
  });

  it("never rounds a side to zero", () => {
    expect(fitWithin(10000, 1)).toEqual({ width: 1280, height: 1 });
  });

  it("honors a custom max", () => {
    expect(fitWithin(400, 200, 100)).toEqual({ width: 100, height: 50 });
  });
});

describe("roundDuration", () => {
  it("rounds to whole seconds (the row's duration is an integer)", () => {
    expect(roundDuration(14.533)).toBe(15);
    expect(roundDuration(14.4)).toBe(14);
    expect(roundDuration(65)).toBe(65);
  });

  it("keeps a clip shorter than half a second at 1, never 0", () => {
    expect(roundDuration(0.3)).toBe(1);
    expect(roundDuration(0.001)).toBe(1);
  });

  it("is null for no length, a non-finite one or a non-positive one", () => {
    expect(roundDuration(null)).toBeNull();
    expect(roundDuration(Number.NaN)).toBeNull();
    expect(roundDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(roundDuration(0)).toBeNull();
    expect(roundDuration(-3)).toBeNull();
  });
});
