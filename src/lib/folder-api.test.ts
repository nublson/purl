import { describe, expect, it } from "vitest";
import type { FolderSummary } from "./folders";
import { toApiFolder } from "./folder-api";

describe("toApiFolder", () => {
  const folder = (): FolderSummary => ({
    id: "f1",
    name: "Reading",
    slug: "reading",
    emoji: "📚",
    description: "Articles",
    isPublic: true,
    position: 2,
    view: "grid",
    sharedView: "list",
    linkCount: 5,
  });

  it("omits the app-only view fields from the v1/MCP shape", () => {
    const api = toApiFolder(folder());
    expect(api).not.toHaveProperty("view");
    expect(api).not.toHaveProperty("sharedView");
    expect(api).toEqual({
      id: "f1",
      name: "Reading",
      slug: "reading",
      emoji: "📚",
      description: "Articles",
      isPublic: true,
      position: 2,
      linkCount: 5,
    });
  });

  it("keeps view null out of the API shape without changing the source row", () => {
    const source = folder();
    source.view = null;
    const api = toApiFolder(source);
    expect(api).not.toHaveProperty("view");
    expect(source.view).toBeNull();
  });
});