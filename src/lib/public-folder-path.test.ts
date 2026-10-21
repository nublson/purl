import { describe, expect, it } from "vitest";
import {
  publicFolderFeedPath,
  publicFolderPath,
  publicFolderTitle,
} from "./public-folder-path";

describe("public folder paths", () => {
  it("builds the page path", () => {
    expect(publicFolderPath("nublson", "design")).toBe("/@nublson/design");
  });

  it("builds the feed path", () => {
    expect(publicFolderFeedPath("nublson", "design")).toBe(
      "/@nublson/design/feed.xml",
    );
  });

  it("builds the shared title", () => {
    expect(publicFolderTitle("🎨", "Design", "nublson")).toBe(
      "🎨 Design by @nublson",
    );
  });
});
