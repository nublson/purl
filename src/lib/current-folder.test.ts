import { describe, expect, it } from "vitest";
import { resolveCurrentFolder } from "./current-folder";

const reading = { id: "f1", name: "Reading", slug: "reading", emoji: "🦪", description: null, isPublic: false, position: 1, linkCount: 2 };
const renamed = { id: "f1", name: "Later", slug: "later", emoji: "📚", description: null, isPublic: false, position: 1, linkCount: 3 };
const other = { id: "f2", name: "Work", slug: "work", emoji: "🦪", description: null, isPublic: false, position: 1, linkCount: 0 };

describe("resolveCurrentFolder", () => {
  it("prefers the fresh list entry matching the page folder's id", () => {
    expect(
      resolveCurrentFolder({
        pageFolder: reading,
        folders: [other, renamed],
        pathname: "/folders/reading",
        slug: "reading",
      }),
    ).toBe(renamed);
  });

  it("falls back to the page folder when its id is missing from the list", () => {
    expect(
      resolveCurrentFolder({
        pageFolder: reading,
        folders: [other],
        pathname: "/folders/reading",
        slug: "reading",
      }),
    ).toBe(reading);
  });

  it("ignores the URL slug when a page folder is provided", () => {
    expect(
      resolveCurrentFolder({
        pageFolder: reading,
        folders: [other],
        pathname: "/folders/work",
        slug: "work",
      }),
    ).toBe(reading);
  });

  it("matches the slug against the list outside a folder page provider", () => {
    expect(
      resolveCurrentFolder({
        pageFolder: null,
        folders: [reading, other],
        pathname: "/folders/work",
        slug: "work",
      }),
    ).toBe(other);
  });

  it("returns null off folder routes and on an unknown slug", () => {
    expect(
      resolveCurrentFolder({
        pageFolder: null,
        folders: [reading],
        pathname: "/home",
        slug: undefined,
      }),
    ).toBeNull();
    expect(
      resolveCurrentFolder({
        pageFolder: null,
        folders: [reading],
        pathname: "/folders/missing",
        slug: "missing",
      }),
    ).toBeNull();
  });
});
