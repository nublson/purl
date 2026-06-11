import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
} from "./user-preferences-shared";

describe("parsePreferences", () => {
  it("returns defaults for nullish and non-object input", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("home")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it("accepts defaultPage ai and preserves showChatWidget when boolean", () => {
    expect(
      parsePreferences({ defaultPage: "ai", showChatWidget: false }),
    ).toEqual({
      defaultPage: "ai",
      showChatWidget: false,
    });
  });

  it("coerces unknown defaultPage values to home", () => {
    expect(parsePreferences({ defaultPage: "chat" })).toEqual({
      defaultPage: "home",
      showChatWidget: true,
    });
    expect(parsePreferences({ defaultPage: 123 })).toEqual({
      defaultPage: "home",
      showChatWidget: true,
    });
  });

  it("defaults showChatWidget to true when missing or not a boolean", () => {
    expect(parsePreferences({})).toEqual({
      defaultPage: "home",
      showChatWidget: true,
    });
    expect(parsePreferences({ showChatWidget: "false" })).toEqual({
      defaultPage: "home",
      showChatWidget: true,
    });
    expect(parsePreferences({ showChatWidget: 0 })).toEqual({
      defaultPage: "home",
      showChatWidget: true,
    });
  });

  it("ignores unrelated keys without affecting parsed output", () => {
    expect(
      parsePreferences({
        defaultPage: "ai",
        showChatWidget: true,
        theme: "dark",
      }),
    ).toEqual({
      defaultPage: "ai",
      showChatWidget: true,
    });
  });
});
