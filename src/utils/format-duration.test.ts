import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(14)).toBe("0:14");
    expect(formatDuration(65)).toBe("1:05");
  });

  it("adds hours when needed", () => {
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("rounds down and tolerates bad input", () => {
    expect(formatDuration(14.9)).toBe("0:14");
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
});
