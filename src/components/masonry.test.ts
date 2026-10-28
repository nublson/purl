import { describe, expect, it } from "vitest";
import { chooseMasonryColumn, placeMasonry } from "./masonry";

describe("chooseMasonryColumn", () => {
  it("fills the first row left to right", () => {
    expect(chooseMasonryColumn([0, 0, 0], -1)).toBe(0);
    expect(chooseMasonryColumn([200, 0, 0], 0)).toBe(1);
    expect(chooseMasonryColumn([200, 210, 0], 1)).toBe(2);
  });

  it("continues to the right of the previous card when columns are level", () => {
    // Left is taller than right but level: the next card goes right, so the
    // card after it can't land higher than it on the left.
    expect(chooseMasonryColumn([520, 500], 0)).toBe(1);
  });

  it("wraps to the leftmost level column to start a new row", () => {
    // Left ends 17px lower than right, previous card on the right: the next
    // card starts the row on the left (reads first), not under it on the right.
    expect(chooseMasonryColumn([831, 814], 1)).toBe(0);
  });

  it("never steps left of the previous card within a row", () => {
    // Three columns: previous card in the middle; left and right both level.
    expect(chooseMasonryColumn([110, 300, 95], 1)).toBe(2);
  });

  it("takes the shortest column when the others are clearly taller", () => {
    expect(chooseMasonryColumn([400, 300], 0)).toBe(1);
    expect(chooseMasonryColumn([300, 400], 1)).toBe(0);
  });
});

describe("placeMasonry", () => {
  it("stacks cards in their columns, each spanning its height", () => {
    expect(
      placeMasonry(
        [
          { height: 100, grow: 0 },
          { height: 100, grow: 0 },
          { height: 50, grow: 0 },
        ],
        2,
      ),
    ).toEqual([
      { column: 0, row: 1, span: 100 },
      { column: 1, row: 1, span: 100 },
      { column: 0, row: 101, span: 50 },
    ]);
  });

  it("keeps every card in its column while one grows in place, moving those below it down", () => {
    // An audio bar opening: 94 → 205 tall (78 → 189, and the gutter). Read
    // by its whole height, the card under it would jump to the other column.
    const shut = placeMasonry(
      [
        { height: 94, grow: 0 },
        { height: 94, grow: 0 },
        { height: 120, grow: 0 },
      ],
      2,
    );
    const open = placeMasonry(
      [
        { height: 205, grow: 111 },
        { height: 94, grow: 0 },
        { height: 120, grow: 0 },
      ],
      2,
    );
    expect(open.map((cell) => cell.column)).toEqual(shut.map((cell) => cell.column));
    expect(open[2]).toEqual({ column: 0, row: 206, span: 120 });
    expect(open[0].span).toBe(205);
  });
});
