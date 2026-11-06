import { describe, expect, it } from "vitest";
import {
  initialSharedView,
  MAX_VISITOR_VIEWS,
  readVisitorView,
  SHARED_GRID_COLUMNS,
  SHARED_VIEWS_COOKIE,
  withVisitorView,
} from "./shared-folder-view";
import { LINK_GRID_COLUMNS } from "./link-view";

describe("shared folder view", () => {
  it("uses the per-folder cookie name", () => {
    expect(SHARED_VIEWS_COOKIE).toBe("purl-shared-views");
    expect(MAX_VISITOR_VIEWS).toBe(50);
  });

  it("reuses the owner's grid column template", () => {
    expect(SHARED_GRID_COLUMNS).toBe(LINK_GRID_COLUMNS);
  });
});

describe("readVisitorView", () => {
  it("finds the visitor's choice for one folder", () => {
    expect(readVisitorView("a:l.b:g", "b")).toBe("grid");
    expect(readVisitorView("a:l.b:g", "a")).toBe("list");
  });

  it("is null for folders the visitor never switched", () => {
    expect(readVisitorView("a:l", "c")).toBeNull();
    expect(readVisitorView(undefined, "a")).toBeNull();
    expect(readVisitorView("", "a")).toBeNull();
  });

  it("ignores malformed and legacy values", () => {
    expect(readVisitorView("garbage", "a")).toBeNull();
    expect(readVisitorView("list", "a")).toBeNull();
    expect(readVisitorView("a:x.a:g", "a")).toBe("grid");
    expect(readVisitorView(":l.a", "a")).toBeNull();
  });
});

describe("withVisitorView", () => {
  it("remembers a choice that differs from the owner's", () => {
    expect(withVisitorView(undefined, "a", "list", "grid")).toBe("a:l");
  });

  it("puts the newest choice first, replacing the folder's old one", () => {
    expect(withVisitorView("b:g.a:l", "a", "grid", "list")).toBe("a:g.b:g");
  });

  it("forgets the choice when it's back to the owner's view", () => {
    expect(withVisitorView("a:l.b:g", "a", "grid", "grid")).toBe("b:g");
    expect(withVisitorView("a:l", "a", "grid", "grid")).toBe("");
  });

  it("keeps the 50 most recent folders", () => {
    const old = Array.from({ length: 60 }, (_, i) => `f${i}:l`).join(".");
    const next = withVisitorView(old, "new", "list", "grid").split(".");
    expect(next).toHaveLength(50);
    expect(next[0]).toBe("new:l");
    expect(next[1]).toBe("f0:l");
  });

  it("drops malformed entries while writing", () => {
    expect(withVisitorView("junk.b:g.a:z", "a", "list", "grid")).toBe("a:l.b:g");
  });
});

describe("initialSharedView", () => {
  it("uses the visitor's choice, else the owner's view", () => {
    expect(initialSharedView(undefined, "a", "list")).toBe("list");
    expect(initialSharedView("a:g", "a", "list")).toBe("grid");
    expect(initialSharedView("b:g", "a", "list")).toBe("list");
  });
});
