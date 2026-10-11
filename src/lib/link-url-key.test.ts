import { describe, expect, it } from "vitest";
import { linkUrlKey } from "./link-url-key";

describe("linkUrlKey", () => {
  it("ignores scheme, www, host case and trailing slashes", () => {
    expect(linkUrlKey("https://www.Example.com/a/")).toBe(
      linkUrlKey("http://example.com/a"),
    );
  });

  it("keeps the query string", () => {
    expect(linkUrlKey("https://example.com/a?x=1")).not.toBe(
      linkUrlKey("https://example.com/a"),
    );
  });

  it("returns unparseable input as is", () => {
    expect(linkUrlKey("not a url")).toBe("not a url");
  });
});
