import { describe, expect, it } from "vitest";
import type { FolderSummary } from "./folders";
import { toApiFolder } from "./folder-api";

const folder = (over: Partial<FolderSummary> = {}): FolderSummary => ({
  id: "f1",
  name: "Reading",
  slug: "reading",
  emoji: "📚",
  description: null,
  isPublic: false,
  position: 1,
  view: "grid",
  linkCount: 2,
  ...over,
});

describe("toApiFolder", () => {
  it("drops the app-only view field", () => {
    const api = toApiFolder(folder());
    expect(api).toMatchObject({
      id: "f1",
      name: "Reading",
      slug: "reading",
      linkCount: 2,
    });
    expect(api).not.toHaveProperty("view");
  });

  it("keeps every other folder field", () => {
    const source = folder({
      emoji: "🎨",
      description: "Notes",
      isPublic: true,
      position: 3,
    });
    expect(toApiFolder(source)).toEqual({
      id: "f1",
      name: "Reading",
      slug: "reading",
      emoji: "🎨",
      description: "Notes",
      isPublic: true,
      position: 3,
      linkCount: 2,
    });
  });
});
