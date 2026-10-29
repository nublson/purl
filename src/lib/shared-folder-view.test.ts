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

  it("parses list from the cookie value and defaults everything else to grid", () => {
    expect(parseSharedFolderView("list")).toBe("list");
    expect(parseSharedFolderView("grid")).toBe("grid");
    expect(parseSharedFolderView("LIST")).toBe("grid");
    expect(parseSharedFolderView("")).toBe("grid");
    expect(parseSharedFolderView(undefined)).toBe("grid");
    expect(parseSharedFolderView(null)).toBe("grid");
  });

  it("reuses the owner's grid column template", () => {
    expect(SHARED_GRID_COLUMNS).toBe(LINK_GRID_COLUMNS);
  });
});
