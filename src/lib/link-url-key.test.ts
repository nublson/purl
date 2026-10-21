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

  it("keeps a non-default port, so different services on one host stay different links", () => {
    expect(linkUrlKey("https://example.com:8443/page")).not.toBe(
      linkUrlKey("https://example.com/page"),
    );
    expect(linkUrlKey("https://example.com:8443/page")).toBe(
      linkUrlKey("http://www.example.com:8443/page/"),
    );
  });

  it("ignores a default port", () => {
    expect(linkUrlKey("https://example.com:443/page")).toBe(
      linkUrlKey("https://example.com/page"),
    );
    expect(linkUrlKey("http://example.com:80/page")).toBe(
      linkUrlKey("http://example.com/page"),
    );
  });

  it("returns unparseable input as is", () => {
    expect(linkUrlKey("not a url")).toBe("not a url");
  });
});
