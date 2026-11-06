import { describe, expect, it } from "vitest";
import {
  effectiveView,
  linkViewFromDb,
  linkViewFromDbOrNull,
  viewTarget,
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
    expect(parseLayoutChange({ playVideos: "no" })).toBeNull();
    expect(parseLayoutChange({ playVideos: false })).toEqual({ playVideos: false });
    expect(parseLayoutChange(null)).toBeNull();
  });
});

describe("folder view", () => {
  it("uses the folder's own view over the account view", () => {
    expect(effectiveView("grid", "list")).toBe("grid");
    expect(effectiveView("list", "grid")).toBe("list");
  });

  it("follows the account view when the folder has none", () => {
    expect(effectiveView(null, "grid")).toBe("grid");
    expect(effectiveView(undefined, "list")).toBe("list");
  });

  it("maps a stored folder view, keeping null as null", () => {
    expect(linkViewFromDbOrNull("GRID")).toBe("grid");
    expect(linkViewFromDbOrNull("LIST")).toBe("list");
    expect(linkViewFromDbOrNull(null)).toBeNull();
    expect(linkViewFromDbOrNull(undefined)).toBeNull();
  });
});

describe("viewTarget", () => {
  it("saves on the folder when the page has one", () => {
    expect(viewTarget(true, "/folders/reading")).toBe("folder");
  });

  it("saves on the account off folder pages", () => {
    expect(viewTarget(false, "/home")).toBe("account");
    expect(viewTarget(false, null)).toBe("account");
  });

  it("saves nowhere on a folder page whose folder isn't found (renamed elsewhere)", () => {
    expect(viewTarget(false, "/folders/old-name")).toBe("none");
  });
});
