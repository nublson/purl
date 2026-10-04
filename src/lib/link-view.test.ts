import { describe, expect, it } from "vitest";
import { linkViewFromDb, linkViewToDb, parseLinkView } from "./link-view";

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
});
