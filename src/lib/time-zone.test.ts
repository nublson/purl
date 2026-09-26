import { describe, expect, it } from "vitest";
import { resolveRequestTimeZone } from "@/lib/time-zone";

describe("resolveRequestTimeZone", () => {
  it("prefers a valid cookie over the header", () => {
    expect(
      resolveRequestTimeZone({ cookie: "Europe/Lisbon", header: "America/New_York" }),
    ).toBe("Europe/Lisbon");
  });

  it("falls back to the header when there is no cookie", () => {
    expect(
      resolveRequestTimeZone({ cookie: null, header: "America/New_York" }),
    ).toBe("America/New_York");
  });

  it("falls back to the header when the cookie is invalid", () => {
    expect(
      resolveRequestTimeZone({ cookie: "Mars/Base", header: "America/New_York" }),
    ).toBe("America/New_York");
  });

  it("falls back to UTC when both cookie and header are invalid", () => {
    expect(resolveRequestTimeZone({ cookie: "Mars/Base", header: "nope" })).toBe(
      "UTC",
    );
  });

  it("falls back to UTC when both are missing", () => {
    expect(
      resolveRequestTimeZone({ cookie: undefined, header: undefined }),
    ).toBe("UTC");
  });

  it("decodes a raw, still-encoded cookie value", () => {
    expect(
      resolveRequestTimeZone({ cookie: "Etc%2FGMT%2B3", header: null }),
    ).toBe("Etc/GMT+3");
  });

  it("accepts an already-decoded cookie value", () => {
    expect(resolveRequestTimeZone({ cookie: "Etc/GMT+3", header: null })).toBe(
      "Etc/GMT+3",
    );
  });
});
