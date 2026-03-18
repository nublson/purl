import { describe, expect, it } from "vitest";
import { isValidUrl } from "./url";

describe("isValidUrl", () => {
  it("returns true for https URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("returns true for http URLs", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
  });

  it("returns false for non-http(s) protocols", () => {
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("file:///tmp/foo")).toBe(false);
    expect(isValidUrl("ftp://example.com")).toBe(false);
  });

  it("returns false for empty or invalid strings", () => {
    expect(isValidUrl("")).toBe(false);
    expect(isValidUrl("not a url")).toBe(false);
    expect(isValidUrl("example.com")).toBe(false);
  });
});
