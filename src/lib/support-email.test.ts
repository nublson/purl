import { describe, expect, it } from "vitest";
import { getSupportEmail } from "./support-email";

describe("getSupportEmail", () => {
  it("returns the address", () => {
    expect(getSupportEmail("help@purl.live")).toBe("help@purl.live");
  });

  it("trims it", () => {
    expect(getSupportEmail("  help@purl.live \n")).toBe("help@purl.live");
  });

  it("takes the first of several recipients", () => {
    expect(getSupportEmail("help@purl.live, me@example.com")).toBe(
      "help@purl.live",
    );
  });

  it("reads the address out of a display-name recipient", () => {
    expect(getSupportEmail("Purl <help@purl.live>")).toBe("help@purl.live");
  });

  it("skips entries that aren't a plain address", () => {
    expect(getSupportEmail("not an address, help@purl.live")).toBe(
      "help@purl.live",
    );
  });

  it.each([
    undefined,
    "",
    "   ",
    "help",
    "help@",
    "@purl.live",
    "help@purl",
    "help@purl.live?cc=evil@example.com",
    "javascript:alert(1)",
    'he"llo@purl.live',
    "he llo@purl.live",
    "<script>@purl.live>",
  ])("returns null for %j", (raw) => {
    expect(getSupportEmail(raw)).toBeNull();
  });
});
