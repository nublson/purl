import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  extendSelection,
  linkSelection,
  retainInSelection,
  setSelectableLinks,
  toggleInSelection,
  type LinkSelectionState,
} from "./link-selection";

const ORDER = ["a", "b", "c", "d", "e"];
const ids = (state: LinkSelectionState) => Array.from(state.selected).sort();

describe("toggleInSelection", () => {
  it("selects, then unselects, moving the anchor each time", () => {
    const one = toggleInSelection(EMPTY_SELECTION, "b");
    expect(ids(one)).toEqual(["b"]);
    expect(one.anchor).toBe("b");
    const two = toggleInSelection(one, "b");
    expect(ids(two)).toEqual([]);
    expect(two.anchor).toBe("b");
  });
});

describe("extendSelection", () => {
  it("selects the range from the anchor, in either direction", () => {
    const anchored = toggleInSelection(EMPTY_SELECTION, "b");
    expect(ids(extendSelection(anchored, "d", ORDER))).toEqual(["b", "c", "d"]);
    const fromD = toggleInSelection(EMPTY_SELECTION, "d");
    expect(ids(extendSelection(fromD, "a", ORDER))).toEqual(["a", "b", "c", "d"]);
  });

  it("unselects the range when the clicked link was selected, keeping the anchor", () => {
    let state = toggleInSelection(EMPTY_SELECTION, "a");
    state = extendSelection(state, "e", ORDER);
    state = toggleInSelection(state, "b");
    // Anchor is now "b" (unselected); Shift-click a selected link unselects b..d.
    state = extendSelection(state, "d", ORDER);
    expect(ids(state)).toEqual(["a", "e"]);
    expect(state.anchor).toBe("b");
  });

  it("is a plain toggle without an anchor in the list", () => {
    const state = extendSelection(EMPTY_SELECTION, "c", ORDER);
    expect(ids(state)).toEqual(["c"]);
    expect(state.anchor).toBe("c");
  });
});

describe("retainInSelection", () => {
  it("drops links (and the anchor) that left the list", () => {
    let state = toggleInSelection(EMPTY_SELECTION, "a");
    state = toggleInSelection(state, "c");
    const next = retainInSelection(state, ["a", "b"]);
    expect(ids(next)).toEqual(["a"]);
    expect(next.anchor).toBeNull();
  });

  it("returns the same state when nothing left", () => {
    const state = toggleInSelection(EMPTY_SELECTION, "a");
    expect(retainInSelection(state, ORDER)).toBe(state);
  });
});

describe("linkSelection store", () => {
  beforeEach(() => {
    linkSelection.clear();
    setSelectableLinks(ORDER);
  });

  it("selects all, reports ids in display order, and clears", () => {
    linkSelection.toggle("d");
    linkSelection.toggle("a");
    expect(linkSelection.selectedIds()).toEqual(["a", "d"]);
    linkSelection.selectAll();
    expect(linkSelection.selectedIds()).toEqual(ORDER);
    linkSelection.clear();
    expect(linkSelection.selectedIds()).toEqual([]);
  });

  it("Shift-click ranges over the registered order", () => {
    linkSelection.toggle("b");
    linkSelection.toggle("d", { shiftKey: true });
    expect(linkSelection.selectedIds()).toEqual(["b", "c", "d"]);
  });

  it("drops links that leave the list", () => {
    linkSelection.selectAll();
    setSelectableLinks(["a", "e"]);
    expect(linkSelection.selectedIds()).toEqual(["a", "e"]);
  });
});
