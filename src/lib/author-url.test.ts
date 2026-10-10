import { describe, expect, it } from "vitest";
import { AUTHOR_FALLBACK_URL, getAuthorUrl } from "./author-url";

describe("getAuthorUrl", () => {
  it("returns an https URL as given", () => {
    expect(getAuthorUrl("https://nublson.com")).toBe("https://nublson.com");
  });
  it("trims whitespace", () => {
    expect(getAuthorUrl("  https://nublson.com/  ")).toBe("https://nublson.com/");
  });
  it.each([undefined, "", "javascript:alert(1)", "http://nublson.com", "not a url"])(
    "falls back for %s",
    (value) => {
      expect(getAuthorUrl(value)).toBe(AUTHOR_FALLBACK_URL);
    },
  );
  it("fallback is the GitHub profile", () => {
    expect(AUTHOR_FALLBACK_URL).toBe("https://github.com/nublson");
  });
});
