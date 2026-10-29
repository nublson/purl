import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

const MB = 1024 * 1024;

describe("formatBytes", () => {
  it("reads 0 as 0 KB", () => {
    expect(formatBytes(0)).toBe("0 KB");
  });

  it("rounds to whole KB below 1 MB", () => {
    expect(formatBytes(640 * 1024)).toBe("640 KB");
    expect(formatBytes(1)).toBe("0 KB");
  });

  it("shows one decimal of MB below 10 MB", () => {
    expect(formatBytes(2.5 * MB)).toBe("2.5 MB");
    expect(formatBytes(MB)).toBe("1.0 MB");
  });

  it("shows whole MB at or above 10 MB", () => {
    expect(formatBytes(10 * MB)).toBe("10 MB");
    expect(formatBytes(120 * MB)).toBe("120 MB");
    expect(formatBytes(250 * MB)).toBe("250 MB");
  });
});
