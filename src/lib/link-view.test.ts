import { describe, expect, it } from "vitest";
import {
  linkViewFromDb,
  linkViewToDb,
  parseLayoutChange,
  parseLinkView,
} from "./link-view";

describe("link view", () => {
  it("accepts only list or grid", () => {
    expect(parseLinkView("list")).toBe("list");
    expect(parseLinkView("grid")).toBe("grid");
    expect(parseLinkView("GRID")).toBeNull();
    expect(parseLinkView(undefined)).toBeNull();
  });

  it("maps to and from the database enum", () => {
    expect(linkViewFromDb("GRID")).toBe("grid");
    expect(linkViewFromDb("LIST")).toBe("list");
    expect(linkViewToDb("grid")).toBe("GRID");
    expect(linkViewToDb("list")).toBe("LIST");
  });

  it("parses a layout change: view and/or folder tags, each valid", () => {
    expect(parseLayoutChange({ view: "grid" })).toEqual({ view: "grid" });
    expect(parseLayoutChange({ folderTags: true })).toEqual({ folderTags: true });
    expect(parseLayoutChange({ view: "list", folderTags: false })).toEqual({
      view: "list",
      folderTags: false,
    });
    expect(parseLayoutChange({})).toBeNull();
    expect(parseLayoutChange({ view: "cards" })).toBeNull();
    expect(parseLayoutChange({ folderTags: 1 })).toBeNull();
    expect(parseLayoutChange(null)).toBeNull();
  });
});
