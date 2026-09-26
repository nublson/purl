import { describe, expect, it } from "vitest";
import {
  isValidTimeZone,
  readTimeZoneCookie,
  serializeTimeZoneCookie,
  timeZoneToPersist,
} from "@/utils/time-zone";

describe("isValidTimeZone", () => {
  it("accepts a real IANA zone", () => {
    expect(isValidTimeZone("Europe/Lisbon")).toBe(true);
  });

  it("rejects an unknown zone", () => {
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTimeZone("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidTimeZone(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("readTimeZoneCookie", () => {
  it("parses a valid zone out of a document.cookie-style string", () => {
    expect(readTimeZoneCookie("a=1; tz=Etc%2FGMT%2B3; b=2")).toBe("Etc/GMT+3");
  });

  it("returns null for an invalid zone", () => {
    expect(readTimeZoneCookie("tz=Mars%2FBase")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(readTimeZoneCookie("")).toBeNull();
  });

  it("round-trips with serializeTimeZoneCookie", () => {
    expect(
      readTimeZoneCookie(serializeTimeZoneCookie("Etc/GMT+3").split(";")[0]),
    ).toBe("Etc/GMT+3");
  });
});

describe("serializeTimeZoneCookie", () => {
  it("encodes the zone and sets cookie attributes", () => {
    expect(serializeTimeZoneCookie("Europe/Lisbon")).toBe(
      "tz=Europe%2FLisbon; path=/; max-age=31536000; samesite=lax",
    );
  });
});

describe("timeZoneToPersist", () => {
  it("returns the browser zone when there is no cookie and it differs from the server zone", () => {
    expect(
      timeZoneToPersist({ browser: "Europe/Lisbon", server: "UTC", cookie: null }),
    ).toBe("Europe/Lisbon");
  });

  it("returns null when the browser zone matches the server zone", () => {
    expect(
      timeZoneToPersist({
        browser: "Europe/Lisbon",
        server: "Europe/Lisbon",
        cookie: null,
      }),
    ).toBeNull();
  });

  it("returns null when the cookie already holds the browser zone, even if the server can't use it yet", () => {
    expect(
      timeZoneToPersist({
        browser: "Europe/Lisbon",
        server: "UTC",
        cookie: "Europe/Lisbon",
      }),
    ).toBeNull();
  });

  it("returns null for an invalid browser zone", () => {
    expect(
      timeZoneToPersist({ browser: "Mars/Base", server: "UTC", cookie: null }),
    ).toBeNull();
  });
});
