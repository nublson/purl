import { describe, expect, it } from "vitest";
import {
  parseSharedFolderView,
  SHARED_FOLDER_VIEW_COOKIE,
  SHARED_GRID_COLUMNS,
} from "./shared-folder-view";
import { LINK_GRID_COLUMNS } from "./link-view";

describe("shared folder view", () => {
  it("uses the shared cookie name", () => {
    expect(SHARED_FOLDER_VIEW_COOKIE).toBe("purl-shared-view");
  });

  it("parses grid from the cookie value and defaults everything else to list", () => {
    expect(parseSharedFolderView("grid")).toBe("grid");
    expect(parseSharedFolderView("list")).toBe("list");
    expect(parseSharedFolderView("GRID")).toBe("list");
    expect(parseSharedFolderView("")).toBe("list");
    expect(parseSharedFolderView(undefined)).toBe("list");
    expect(parseSharedFolderView(null)).toBe("list");
  });

  it("reuses the owner's grid column template", () => {
    expect(SHARED_GRID_COLUMNS).toBe(LINK_GRID_COLUMNS);
  });
});
